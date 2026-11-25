import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const usernameRegex = /^[a-zA-Z0-9._-]{3,32}$/;

const userSchema = new mongoose.Schema(
  {
    fullName: {
      type: String,
      required: true,
      trim: true,
    },
    username: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      minlength: 3,
      maxlength: 32,
      match: [
        usernameRegex,
        'Username must be 3–32 characters and may contain letters, numbers, dots, underscores, or hyphens',
      ],
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
    /** Role requested at signup; final role is set on admin approval. */
    requestedRole: {
      type: String,
      enum: [
        'admin',
        'sales_agent',
        'closer',
        'cst_manager',
        'tech_head',
        'tech_team',
      ],
      default: undefined,
    },
    role: {
      type: String,
      enum: [
        'super_admin',
        'admin',
        'sales_agent',
        'closer',
        'cst_manager',
        'tech_head',
        'tech_team',
      ],
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
    /**
     * Login / contact email (Tech Head team creates; optional for legacy users).
     * Auth accepts `username` or `email` as the login identifier.
     */
    email: {
      type: String,
      default: null,
      trim: true,
      lowercase: true,
    },
    /**
     * Tech Department job description (specialists only).
     * Intern requires assignedMentorId.
     */
    jd: {
      type: String,
      enum: [
        'Developer',
        'Content Writer',
        'SEO Expert',
        'Social Media Manager',
        'Graphic Designer',
        'Intern',
      ],
      default: undefined,
    },
    /** Mentor / Reports-To for Interns (tech_team user with non-Intern jd). */
    assignedMentorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
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
