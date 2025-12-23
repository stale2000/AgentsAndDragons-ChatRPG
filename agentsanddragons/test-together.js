// Simple test script to verify TogetherAI API connection
// Run with: node test-together.js

async function testTogetherAI() {
  const apiKey = process.env.TOGETHER_API_KEY;
  
  if (!apiKey) {
    console.error('❌ TOGETHER_API_KEY environment variable is not set');
    console.log('Please set it in your .env.local file or export it:');
    console.log('export TOGETHER_API_KEY="your_api_key_here"');
    return;
  }

  console.log('🔑 API Key found:', apiKey.substring(0, 10) + '...');

  const testPayload = {
    model: "meta-llama/Llama-3-8b-chat-hf",
    messages: [
      { role: "user", content: "Hello! Can you say hi back?" }
    ],
    temperature: 0.7,
    max_tokens: 50,
    stream: false
  };

  console.log('📤 Testing TogetherAI API with payload:', JSON.stringify(testPayload, null, 2));

  try {
    const response = await fetch("https://api.together.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify(testPayload),
    });

    console.log('📥 Response status:', response.status, response.statusText);

    if (!response.ok) {
      const errorBody = await response.text();
      console.error('❌ Error response:', errorBody);
      return;
    }

    const data = await response.json();
    console.log('✅ Success! Response:', JSON.stringify(data, null, 2));

  } catch (error) {
    console.error('❌ Network error:', error.message);
  }
}

testTogetherAI();
