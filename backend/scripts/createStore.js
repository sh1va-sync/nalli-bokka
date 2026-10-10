import 'dotenv/config';
import mongoose from 'mongoose';
import readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import Store from '../src/models/Store.js';

function askHidden(question) {
  return new Promise((resolve, reject) => {
    if (!stdin.isTTY || typeof stdin.setRawMode !== 'function') {
      reject(new Error('Run this command in an interactive terminal to enter the store password safely'));
      return;
    }

    stdout.write(question);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    let value = '';
    const onInput = character => {
      if (character === '\u0003') {
        stdin.setRawMode(false);
        stdin.pause();
        stdin.off('data', onInput);
        reject(new Error('Store creation cancelled'));
        return;
      }
      if (character === '\r' || character === '\n') {
        stdin.setRawMode(false);
        stdin.pause();
        stdin.off('data', onInput);
        stdout.write('\n');
        resolve(value);
        return;
      }
      if (character === '\u0008' || character === '\u007f') {
        value = value.slice(0, -1);
        return;
      }
      value += character;
    };
    stdin.on('data', onInput);
  });
}

const prompts = readline.createInterface({ input: stdin, output: stdout });

try {
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI is required');
  }
  await mongoose.connect(process.env.MONGODB_URI);

  const storeName = (await prompts.question('Store name: ')).trim();
  const username = (await prompts.question('Store username: ')).trim().toLowerCase();
  const location = (await prompts.question('Store location: ')).trim();
  prompts.close();
  const password = await askHidden('Store password (hidden): ');
  if (!storeName || !username || !location || password.length < 8) {
    throw new Error('Store name, username, and location are required; password must be at least 8 characters');
  }

  const store = await Store.create({ storeName, username, location, password });
  console.log(`Store account "${store.username}" created.`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  prompts.close();
  await mongoose.disconnect();
}
