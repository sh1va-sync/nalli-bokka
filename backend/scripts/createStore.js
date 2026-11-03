import 'dotenv/config';
import mongoose from 'mongoose';
import readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import Store from '../src/models/Store.js';
import { prepareStoreInput } from '../src/utils/storeProvisioning.js';

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

  const storeName = await prompts.question('Store name: ');
  const username = await prompts.question('Store username: ');
  const location = await prompts.question('Store location: ');
  const storePhone = await prompts.question('Store phone (optional): ');
  const storeNumber = await prompts.question('Store number (optional legacy contact): ');
  const googleMapsLink = await prompts.question('Google Maps link (optional): ');
  const googleMapLink = await prompts.question('Legacy Google Map link (optional): ');
  const mapLink = await prompts.question('Map link (optional): ');
  const isOpen = await prompts.question('Store open now? (yes/no) [yes]: ') || 'yes';
  const minimumOrderValue = await prompts.question('Minimum order value [0]: ') || '0';
  const openingTime = await prompts.question('Opening time, HH:00 or HH:30 [09:00]: ') || '09:00';
  const closingTime = await prompts.question('Closing time, HH:00 or HH:30 [21:00]: ') || '21:00';
  prompts.close();
  const password = await askHidden('Store password (hidden): ');
  const storeInput = prepareStoreInput({
    storeName,
    username,
    location,
    storePhone,
    storeNumber,
    googleMapsLink,
    googleMapLink,
    mapLink,
    isOpen,
    minimumOrderValue,
    openingTime,
    closingTime,
    password,
  });

  const store = await Store.create(storeInput);
  console.log(`Store account "${store.username}" created.`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  prompts.close();
  await mongoose.disconnect();
}
