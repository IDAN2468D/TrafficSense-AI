import { GoogleGenAI, Type } from "@google/genai";
import { TrafficAnalysisResult, CongestionLevel } from "../types";

const ANALYSIS_PROMPT = `
Analyze this video frame of a traffic scene.
1. Detect and count vehicles (cars, trucks, buses, motorcycles).
2. Return a list of bounding boxes for each detected vehicle in normalized coordinates (0-1).
3. Determine the congestion level based on vehicle density.
4. Provide a very brief 1-sentence description.

Return JSON.
`;

export const analyzeTrafficFrame = async (base64Image: string): Promise<TrafficAnalysisResult> => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    throw new Error("API Key not found in environment variables.");
  }

  const ai = new GoogleGenAI({ apiKey });

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: "image/jpeg",
              data: base64Image,
            },
          },
          {
            text: ANALYSIS_PROMPT,
          },
        ],
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            vehicleCount: { type: Type.INTEGER },
            congestionLevel: { type: Type.STRING, enum: ["Low", "Medium", "High"] },
            description: { type: Type.STRING },
            detectedObjects: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  ymin: { type: Type.NUMBER },
                  xmin: { type: Type.NUMBER },
                  ymax: { type: Type.NUMBER },
                  xmax: { type: Type.NUMBER },
                  label: { type: Type.STRING },
                }
              }
            }
          },
          required: ["vehicleCount", "congestionLevel", "description", "detectedObjects"],
        },
      },
    });

    const text = response.text;
    if (!text) throw new Error("No response from Gemini");

    const json = JSON.parse(text);

    return {
      vehicleCount: json.vehicleCount,
      congestionLevel: json.congestionLevel as CongestionLevel,
      description: json.description,
      detectedObjects: json.detectedObjects || [],
      timestamp: new Date().toLocaleTimeString(),
      processedAt: Date.now(),
    };

  } catch (error: any) {
    // Gracefully handle quota errors
    // IMPORTANT: Error objects often stringify to '{}', so we must check .message directly
    const errorMessage = error.message || String(error);
    
    if (
      errorMessage.includes('429') || 
      errorMessage.includes('RESOURCE_EXHAUSTED') || 
      errorMessage.includes('quota') ||
      errorMessage.includes('exceeded')
    ) {
        console.warn("Gemini Quota Exceeded. Pausing analysis briefly.");
        throw new Error("QUOTA_EXCEEDED");
    }

    console.error("Gemini Analysis Error:", error);
    throw error;
  }
};