import mongoose from 'mongoose';

const testCaseSchema = new mongoose.Schema({
  input: {
    nums: [Number],
    target: [Number]
  },
  output: [Number]
});

const problemSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true
  },
  description: {
    type: String,
    required: true
  },
  input: {
    nums: {
      type: String,
      required: true
    },
    target: {
      type: String,
      required: true
    }
  },
  defaultcode : String,
  testCases: [testCaseSchema],
  constraints: [String],
});

const Problem = mongoose.model('Problem', problemSchema);

export default Problem;