// Test script to verify Together AI tool calling
const fs = require('fs');
const path = require('path');

async function testToolCalls() {
  // Read API key from .env.local
  let apiKey = null;
  try {
    const envPath = path.join(__dirname, '.env.local');
    const envContent = fs.readFileSync(envPath, 'utf8');
    const match = envContent.match(/TOGETHER_API_KEY=(.+)/);
    if (match) {
      apiKey = match[1].trim();
    }
  } catch (e) {
    console.error('Could not read .env.local:', e.message);
  }
  
  if (!apiKey) {
    console.error('TOGETHER_API_KEY not found in .env.local');
    console.error('Please ensure .env.local exists and contains TOGETHER_API_KEY=your_key');
    process.exit(1);
  }

  const tools = [
    {
      type: "function",
      function: {
        name: "roll_dice",
        description: "Roll dice using standard notation (e.g., \"2d6+4\", \"4d6kh3\")",
        parameters: {
          type: "object",
          properties: {
            expression: {
              type: "string",
              description: "Dice expression for single roll (e.g., \"2d6+4\", \"1d20\", \"4d6kh3\")"
            }
          },
          required: ["expression"]
        }
      }
    }
  ];

  const requestBody = {
    model: "meta-llama/Llama-4-Scout-17B-16E-Instruct",
    messages: [
      {
        role: "user",
        content: "roll 1d20"
      }
    ],
    tools: tools,
    tool_choice: "auto",
    temperature: 0,
    max_tokens: 512
  };

  console.log('Sending request to Together AI...');
  console.log('Request body:', JSON.stringify(requestBody, null, 2));

  try {
    const response = await fetch("https://api.together.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Error:', response.status, response.statusText);
      console.error('Error body:', errorText);
      return;
    }

    const data = await response.json();
    const message = data.choices[0]?.message || {};
    
    console.log('\n=== RESPONSE ===');
    console.log('Content:', message.content || '(empty)');
    console.log('Tool calls:', message.tool_calls ? JSON.stringify(message.tool_calls, null, 2) : 'None');
    console.log('Has tool calls:', !!message.tool_calls);
    console.log('Tool calls count:', message.tool_calls?.length || 0);
    
    if (message.tool_calls && message.tool_calls.length > 0) {
      console.log('\n✅ SUCCESS: Together AI returned tool calls!');
      message.tool_calls.forEach((tc, i) => {
        console.log(`\nTool call ${i + 1}:`);
        console.log(`  ID: ${tc.id}`);
        console.log(`  Function: ${tc.function?.name}`);
        console.log(`  Arguments: ${tc.function?.arguments}`);
      });
    } else {
      console.log('\n❌ ISSUE: Together AI did NOT return tool calls');
      console.log('The model responded with text instead of calling the tool.');
    }
  } catch (error) {
    console.error('Request failed:', error);
  }
}

testToolCalls();

