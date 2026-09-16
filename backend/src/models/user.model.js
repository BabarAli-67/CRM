import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const emailRegex = /^\S+@\S+\.\S+$/;

const userSchema = new mongoose.Schema(
  {
    fullName: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: [emailRegex, 'Please provide a valid email address'],
    },
    phone: {
      type: String,
      required: true,
      trim: true,
    },
    password: {
      type: String,
      required: true,
      minlength: 8,
      select: false,
    },
    role: {
      type: String,
      enum: ['super_admin', 'admin', 'sales_agent', 'closer', 'cst_manager', 'tech_team'],
      default: null,
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
    },
    // isAdmin is true ONLY for role: 'super_admin'. The 'admin' role (Auditor) always has isAdmin: false.
    isAdmin: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

userSchema.pre('save', async function hashPassword() {
  if (!this.isModified('password')) {
    return;
  }

  this.password = await bcrypt.hash(this.password, 12);
});
userSchema.methods.comparePassword = async function comparePassword(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

userSchema.methods.toSafeObject = function toSafeObject() {
  const obj = this.toObject();
  delete obj.password;
  return obj;
};

export default mongoose.model('User', userSchema);
