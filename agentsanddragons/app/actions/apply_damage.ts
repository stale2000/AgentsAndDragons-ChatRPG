"use server";

export type ApplyDamageParams = {
  clientId: string;
  targetUuid: string;
  damage: number;
};

export type ApplyDamageResponse = {
  success: boolean;
  newValue?: number;
  oldValue?: number;
  error?: string;
};

export async function applyDamage(params: ApplyDamageParams): Promise<ApplyDamageResponse> {
  const apiKey = process.env.FOUNDRY_API_KEY;
  if (!apiKey) {
    return { success: false, error: 'Missing FOUNDRY_API_KEY' };
  }
  if (!params?.clientId) {
    return { success: false, error: 'clientId is required' };
  }

  const base = process.env.FOUNDRY_RELAY_BASE_URL || "http://localhost:3010";
  const url = new URL("/decrease", base);
  url.searchParams.set("clientId", params.clientId);
  url.searchParams.set("uuid", params.targetUuid);

  try {
    const response = await fetch(url.toString(), {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        attribute: "system.attributes.hp.value",
        amount: params.damage,
      }),
      cache: "no-store",
    });

    if (!response.ok) {
      const text = await response.text();
      return {
        success: false,
        error: `Foundry API error: ${response.status} ${response.statusText} - ${text}`,
      };
    }

    const data = await response.json();
    return {
      success: data.success ?? true,
      newValue: data.newValue,
      oldValue: data.oldValue,
    };
  } catch (e: any) {
    return {
      success: false,
      error: e?.message || "Failed to apply damage",
    };
  }
}

