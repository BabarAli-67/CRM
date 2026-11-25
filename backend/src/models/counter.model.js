import mongoose from 'mongoose';

/** Atomic counters (e.g. Tech Department projectNumber). */
const counterSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  seq: { type: Number, required: true, default: 0 },
});

export default mongoose.model('Counter', counterSchema);
