import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/**
 * Extract hierarchical categories and 5-6 high-quality keywords from product data using LLM
 * @param {Object} productData - The scraped product data
 * @param {string} productData.title - Product title
 * @param {string} productData.description - Product description
 * @param {string} productData.specs - Product specifications
 * @param {Array<string>} productData.breadcrumbs - Breadcrumb array
 * @param {string} productData.brand - Product brand
 * @returns {Promise<Object>} { categories: string[], keywords: string[], confidence: number }
 */
export async function extractTagsWithLLM(productData) {
  const { title, description, specs, breadcrumbs, brand } = productData;

  const prompt = `Analyze this e-commerce product and extract:
1. HIERARCHICAL CATEGORIES - Full category path from general to specific (e.g., Women > Shoes > Sneakers > Running)
2. 5-6 HIGH-QUALITY KEYWORDS - Brand, product line, and key attributes

Product Data:
- Title: ${title || 'N/A'}
- Brand: ${brand || 'N/A'}
- Breadcrumbs: ${breadcrumbs?.join(' > ') || 'N/A'}
- Description: ${description?.substring(0, 500) || 'N/A'}
- Specs: ${specs?.substring(0, 300) || 'N/A'}

CATEGORY EXTRACTION RULES:
1. Extract the FULL category path with all intermediate levels (don't skip levels)
2. Order: Gender/Age → Type → Style → Specific Use
3. Examples:
   - Women > Shoes > Sneakers > Running (not Women > Shoes > Running)
   - Men > Clothing > Tops > T-Shirts (not Men > Clothing > T-Shirts)
   - Home > Furniture > Bedroom > Beds (not Home > Bedroom > Beds)
4. Use breadcrumbs as primary source but validate with title/description
5. Return as array: ["Women", "Shoes", "Sneakers", "Running"]

KEYWORD EXTRACTION RULES:
1. MUST include (if available):
   - Brand name (e.g., "Nike")
   - Product line + model combined (e.g., "Air Force 270", not separate)
2. Fill remaining 3-4 slots with:
   - Materials (mesh, leather, cotton)
   - Colors (white, black, blue)
   - Style/use case (athletic, casual, running)
   - Key features (cushioned, waterproof, lightweight)
3. Skip generic words (shoes, product, item)
4. Skip words already in category path
5. Order by confidence (most certain first)
6. Max 6 keywords total

Respond in JSON format:
{
  "categories": ["Level1", "Level2", "Level3", "Level4"],
  "keywords": ["brand", "product-line-model", "attribute1", "attribute2", "attribute3", "attribute4"],
  "confidence": 0.85,
  "reasoning": "Brief explanation of choices"
}`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.3,
      max_tokens: 500
    });

    const result = JSON.parse(response.choices[0].message.content);
    
    return {
      categories: result.categories || [],
      keywords: result.keywords || [],
      confidence: result.confidence || 0.7,
      reasoning: result.reasoning || ''
    };
  } catch (error) {
    console.error('LLM tagging error:', error);
    throw new Error(`LLM tagging failed: ${error.message}`);
  }
}

/**
 * Retry LLM tagging with user feedback
 * @param {Object} productData - Original product data
 * @param {string} feedback - User's feedback about what was wrong
 * @returns {Promise<Object>} New suggestions
 */
export async function retryWithFeedback(productData, feedback) {
  const { title, description, specs, breadcrumbs, brand } = productData;

  const prompt = `The previous tagging attempt was rejected with this feedback: "${feedback}"

Please re-analyze this product and provide better suggestions.

Product Data:
- Title: ${title || 'N/A'}
- Brand: ${brand || 'N/A'}
- Breadcrumbs: ${breadcrumbs?.join(' > ') || 'N/A'}
- Description: ${description?.substring(0, 500) || 'N/A'}
- Specs: ${specs?.substring(0, 300) || 'N/A'}

Apply the same rules as before but consider the user's feedback.

Respond in JSON format:
{
  "categories": ["Level1", "Level2", "Level3", "Level4"],
  "keywords": ["brand", "product-line-model", "attribute1", "attribute2", "attribute3"],
  "confidence": 0.85,
  "reasoning": "How this addresses the feedback"
}`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.5,
      max_tokens: 500
    });

    const result = JSON.parse(response.choices[0].message.content);
    
    return {
      categories: result.categories || [],
      keywords: result.keywords || [],
      confidence: result.confidence || 0.7,
      reasoning: result.reasoning || ''
    };
  } catch (error) {
    console.error('LLM retry error:', error);
    throw new Error(`LLM retry failed: ${error.message}`);
  }
}
