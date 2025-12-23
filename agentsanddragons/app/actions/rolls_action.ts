"use server";

export type RollParams = {
  clientId: string;
  formula?: string;
  itemUuid?: string;
  flavor?: string;
  createChatMessage?: boolean;
  speaker?: string;
  target?: string;
};

export type RollResponse = {
  success: boolean;
  roll?: {
    formula: string;
    total: number;
    isCritical: boolean;
    isFumble: boolean;
    dice: Array<{
      faces: number;
      results: Array<{
        result: number;
        active: boolean;
      }>;
    }>;
    timestamp: number;
  };
  rawData?: any;
  error?: string;
};

export async function makeRoll(params: RollParams): Promise<RollResponse> {
  const apiKey = process.env.FOUNDRY_API_KEY;
  if (!apiKey) {
    return { success: false, error: 'Missing FOUNDRY_API_KEY' };
  }
  if (!params?.clientId) {
    return { success: false, error: 'clientId is required' };
  }

  const base = process.env.FOUNDRY_RELAY_BASE_URL || "http://localhost:3010";
  const url = new URL("/roll", base);
  url.searchParams.set("clientId", params.clientId);

  const body: any = {
    createChatMessage: params.createChatMessage ?? true,
  };

  if (params.formula) body.formula = params.formula;
  if (params.itemUuid) body.itemUuid = params.itemUuid;
  if (params.flavor) body.flavor = params.flavor;
  if (params.speaker) body.speaker = params.speaker;
  if (params.target) body.target = params.target;

  try {
    const response = await fetch(url.toString(), {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });

    const contentType = response.headers.get("content-type") || "";
    const raw = await response.text();

    if (!response.ok) {
      return {
        success: false,
        error: `Foundry roll error: ${response.status} ${response.statusText} - ${raw}`,
      };
    }

    if (!contentType.includes("application/json")) {
      return {
        success: false,
        error: "Unexpected non-JSON response from roll endpoint",
      };
    }

    const data = JSON.parse(raw);
    console.log('Roll response from Foundry:', JSON.stringify(data, null, 2));
    
    // The roll data is nested at rawData.data.roll
    const rollData = data.rawData?.data?.roll || data.data?.roll || data.roll;
    
    return {
      success: data.success ?? true,
      roll: rollData,
      rawData: data,
    };
  } catch (e: any) {
    console.error('Roll error:', e);
    return {
      success: false,
      error: e?.message || "Failed to make roll",
    };
  }
}
