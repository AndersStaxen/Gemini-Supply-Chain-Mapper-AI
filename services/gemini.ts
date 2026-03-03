
import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import { AnalysisResult, GroundingSource, StockItem } from "../types";

// gemini-2.5-flash is required for Maps Grounding.
const MAPPING_MODEL = 'gemini-2.5-flash'; 
// gemini-3-pro-preview is used for complex reasoning and strategic analysis.
const PRO_MODEL = 'gemini-3-pro-preview';

/**
 * Analyzes a single company's supply chain using Google Maps and Search.
 */
export const analyzeSupplyChain = async (ticker: string, userLocation?: { latitude: number, longitude: number }): Promise<AnalysisResult> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const systemInstruction = `
    You are a supply chain and financial geography expert. 
    For the given stock ticker, perform a deep dive into its global footprint and current market status using real-time data.
    
    Tasks:
    1. Fetch the CURRENT real-time share price (USD) and current Market Cap.
    2. Identify the official company website DOMAIN (e.g., apple.com, tesla.com).
    3. Locate the Global Headquarters (HQ).
    4. Identify major active production or manufacturing facilities.
    5. Identify critical global suppliers and dependencies.
    6. Identify major customer regions.
    
    Use Google Search for the latest financial data and news, and Google Maps for specific coordinates.
    
    CRITICAL: At the end of your analysis, provide a section exactly called "DATA_BLOCK" containing:
    PRICE|Value (Number only, e.g., 150.25)
    CAP|Value (String, e.g., $3.4T)
    DOMAIN|Value (Official website domain, e.g., microsoft.com)
    MARKER|Type|Name|Lat|Lng|Description
    
    Types MUST be one of: HQ, Factory, Supplier, Customer.
    Ensure the main analysis text is professional Markdown.
  `;

  const response: GenerateContentResponse = await ai.models.generateContent({
    model: MAPPING_MODEL,
    contents: `Fetch current price and analyze the global supply chain of ${ticker}. Provide latest financial data and plot key locations in the DATA_BLOCK section.`,
    config: {
      tools: [{ googleMaps: {} }, { googleSearch: {} }],
      toolConfig: {
        retrievalConfig: {
          latLng: userLocation
        }
      },
      systemInstruction: systemInstruction
    },
  });

  const text = response.text || "No analysis available.";
  
  const sources: GroundingSource[] = [];
  const groundingMetadata = response.candidates?.[0]?.groundingMetadata;
  
  if (groundingMetadata?.groundingChunks) {
    groundingMetadata.groundingChunks.forEach((chunk: any) => {
      if (chunk.maps) {
        sources.push({
          title: chunk.maps.title || "Google Maps Location",
          uri: chunk.maps.uri
        });
      } else if (chunk.web) {
        sources.push({
          title: chunk.web.title || "Web Source",
          uri: chunk.web.uri
        });
      }
    });
  }

  // Parse price, market cap, and domain from the text if present in DATA_BLOCK
  let price: number | undefined;
  let marketCap: string | undefined;
  let domain: string | undefined;
  
  text.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed.startsWith('PRICE|')) {
      const val = parseFloat(trimmed.split('|')[1]);
      if (!isNaN(val)) price = val;
    } else if (trimmed.startsWith('CAP|')) {
      marketCap = trimmed.split('|')[1];
    } else if (trimmed.startsWith('DOMAIN|')) {
      domain = trimmed.split('|')[1]?.toLowerCase().trim();
    }
  });

  return {
    ticker,
    content: text,
    sources,
    price,
    marketCap,
    domain
  };
};

/**
 * Performs a complex portfolio-wide risk assessment using Gemini 3 Pro.
 */
export const analyzePortfolioRisk = async (portfolio: StockItem[], existingAnalyses: Record<string, AnalysisResult>): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const portfolioContext = portfolio.map(s => {
    const analysis = existingAnalyses[s.ticker];
    return `Stock: ${s.ticker} (${s.shares} shares). Primary Locations/Suppliers: ${analysis?.content.substring(0, 500) || 'No data yet'}`;
  }).join('\n\n');

  const prompt = `
    You are a Strategic Risk Consultant. Analyze the following investment portfolio for geographic concentration and supply chain vulnerabilities.
    
    Portfolio Data:
    ${portfolioContext}
    
    Identify:
    1. Single points of failure (e.g., do multiple stocks depend on the same region like Taiwan or a single supplier like TSMC?).
    2. Geopolitical risks based on headquarters and factory locations.
    3. Suggested diversification strategies from a supply-chain perspective.
    
    Format your response in professional Markdown with clear headings. Use a warning/alert tone where appropriate.
  `;

  const response = await ai.models.generateContent({
    model: PRO_MODEL,
    contents: prompt,
    config: {
      temperature: 0.7,
      topP: 0.95,
    }
  });

  return response.text || "Unable to generate portfolio risk assessment.";
};