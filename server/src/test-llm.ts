import 'dotenv/config';
import { GeminiClient } from './llm/gemini-client.js';

async function main() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.error('❌ GEMINI_API_KEY is not set in .env');
        process.exit(1);
    }

    console.log('🤖 Testing Gemini Client...');
    const client = new GeminiClient(apiKey);

    try {
        console.log('Sending prompt: "Hello, explain quantum physics in 10 words."');
        const response = await client.generate('gemini-2.0-flash', 'Hello, explain quantum physics in 10 words.');
        console.log('✅ Response:', response);
    } catch (error) {
        console.error('❌ Error testing generation:', error);
    }

    try {
        console.log('\nStreaming prompt: "Count from 1 to 5."');
        const stream = client.generateStream('gemini-2.0-flash', 'Count from 1 to 5.');
        process.stdout.write('✅ Stream: ');
        for await (const chunk of stream) {
            process.stdout.write(chunk.text);
        }
        console.log('\n');
    } catch (error) {
        console.error('❌ Error testing streaming:', error);
    }
}

main().catch(console.error);
