import { INDICATORS } from './healthReportRules';

const GEMINI_API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY as string;
const MODEL = 'gemini-2.5-flash';
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

export interface RawExtractedValue {
  key: string;
  value: number;
}

// 生成给 Gemini 的提示词，明确要求把报告上的指标数值转换到我们统一使用的单位
function buildPrompt(): string {
  const indicatorList = INDICATORS.map((i) => `- ${i.key}（${i.label}，单位统一换算成 ${i.unit}）`).join('\n');
  return `你是一个医学体检报告数字提取助手。请仔细阅读这张体检报告图片，只提取以下指标（如果报告里有的话），并把数值统一换算成指定单位：

${indicatorList}

血压如果报告里是"120/80"这种格式，收缩压(systolic_bp)取前面的数字（120）。

请只返回一个JSON数组，不要有任何其他文字、不要用markdown代码块包裹，格式严格如下：
[{"key": "fasting_glucose", "value": 5.8}, {"key": "total_cholesterol", "value": 5.5}]

如果某个指标在报告里找不到，就不要放进数组里。如果完全没有可识别的指标，返回空数组 []。`;
}

/**
 * 将体检报告图片发给 Gemini，提取出结构化的指标数值
 * @param base64Image 不带 data:image/...;base64, 前缀的纯 base64 字符串
 * @param mimeType 例如 'image/jpeg'
 */
export async function extractHealthIndicators(
  base64Image: string,
  mimeType: string
): Promise<RawExtractedValue[]> {
  if (!GEMINI_API_KEY) {
    throw new Error('缺少 Gemini API Key，请检查 .env 配置');
  }

  const body = {
    contents: [
      {
        role: 'user',
        parts: [
          { text: buildPrompt() },
          { inline_data: { mime_type: mimeType, data: base64Image } },
        ],
      },
    ],
    generationConfig: {
      temperature: 0,
    },
  };

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': GEMINI_API_KEY,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini API 请求失败 (${res.status}): ${errText}`);
  }

  const json = await res.json();
  const text: string = json?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

  // 防御性处理：万一模型还是包了一层 markdown 代码块
  const cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();

  try {
    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item) => typeof item.key === 'string' && typeof item.value === 'number'
    );
  } catch (err) {
    console.warn('解析 Gemini 返回内容失败', text);
    throw new Error('识别结果解析失败，请换一张更清晰的图片重试');
  }
}
