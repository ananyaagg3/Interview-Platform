import mongoose from 'mongoose';

const problemSchema = new mongoose.Schema({
  title: { type: String, required: true },
  topic: { type: String, required: true },
  difficulty: { type: String, required: true, enum: ['Easy', 'Medium', 'Hard'] },
  description: { type: String, required: true },
  source: { type: String, default: 'bank' }
});

export default mongoose.model('Problem', problemSchema);
