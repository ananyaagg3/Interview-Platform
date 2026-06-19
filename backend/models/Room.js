import mongoose from 'mongoose';

const roomSchema = new mongoose.Schema({
  roomId: { type: String, required: true, unique: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  interviewerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  candidateId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  problemSource: { type: String, required: true, enum: ['bank', 'custom'] },
  problemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Problem', default: null },
  customProblem: {
    title: { type: String },
    description: { type: String }
  },
  duration: { type: Number, required: true },
  defaultLanguage: { type: String, required: true },
  status: { type: String, required: true, enum: ['waiting', 'active', 'ended'], default: 'waiting' },
  currentCode: { type: String, default: '' },
  currentLanguage: { type: String, default: '' },
  sessionStartedAt: { type: Date, default: null },
  sessionEndedAt: { type: Date, default: null },
  interviewerNotes: { type: String, default: "" },
  whiteboardSnapshot: { type: String, default: null }, // base64 PNG string
  feedbackReport: { type: Object, default: null }, // parsed JSON from Gemini
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.model('Room', roomSchema);
