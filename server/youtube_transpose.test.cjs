
const axios = require('axios');
const fs = require('fs');
const assert = require('assert');

const TEST_URL = 'https://www.youtube.com/watch?v=nQWFzMvCfLE';
const API_URL = 'http://localhost:4000/api/youtube-transpose';
const OUTPUT_FILE = 'test_output.wav';

async function runTest() {
  try {
    const response = await axios({
      method: 'post',
      url: API_URL,
      data: { url: TEST_URL, semitones: 0 },
      responseType: 'stream',
      headers: { 'Content-Type': 'application/json' },
      timeout: 120000,
      validateStatus: () => true,
    });
    if (response.status !== 200) {
      let errorBody = '';
      try {
        response.data.setEncoding('utf8');
        for await (const chunk of response.data) {
          errorBody += chunk;
        }
        console.error('Test failed: Non-200 response:', response.status, errorBody);
      } catch (e) {
        console.error('Test failed: Non-200 response:', response.status);
      }
      process.exit(1);
    }
    const writer = fs.createWriteStream(OUTPUT_FILE);
    response.data.pipe(writer);
    await new Promise((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
    });
    const stats = fs.statSync(OUTPUT_FILE);
    assert(stats.size > 10000, 'Output file is too small, likely failed');
    console.log('Test passed: Output file created and is non-trivial size.');
    fs.unlinkSync(OUTPUT_FILE);
    process.exit(0);
  } catch (err) {
    console.error('Test failed:', err.response ? err.response.data : err);
    process.exit(1);
  }
}

runTest();
