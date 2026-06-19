import mongoose from 'mongoose';
import Problem from '../models/Problem.js';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/interview-platform';

async function seed() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');

    const count = await Problem.countDocuments();
    if (count > 0) {
      console.log('Problems already seeded. Skipping.');
      process.exit(0);
    }

    const data = JSON.parse(fs.readFileSync(new URL('./problems.json', import.meta.url)));
    await Problem.insertMany(data);
    
    console.log(`Seeded ${data.length} problems successfully.`);
    process.exit(0);
  } catch (err) {
    console.error('Seed error:', err);
    process.exit(1);
  }
}

seed();
