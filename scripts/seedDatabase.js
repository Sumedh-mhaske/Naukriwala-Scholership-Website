// scripts/seedDatabase.js
const mongoose = require("mongoose");
require("dotenv").config();

// Database connection
mongoose.connect(
  process.env.MONGODB_URI || "mongodb://localhost:27017/scholarship_app",
  {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  },
);

// Test data for development
const sampleApplications = [
  {
    applicationId: "NF202501011234TEST",
    name: "राहुल शर्मा",
    email: "rahul.test@example.com",
    phone: "9876543210",
    dob: new Date("2005-06-15"),
    gender: "Male / पुरुष",
    category: "8वी–12वी",
    school: "Test High School, Mumbai",
    state: "Maharashtra",
    district: "Mumbai",
    pincode: "400001",
    address: "Test Address, Mumbai",
    income_amount: 150000,
    income_band: "₹1,00,000 – ₹3,00,000",
    achievements: "State level science competition winner",
    recommendation: "Principal John Doe - 9876543211",
    sop: "I come from a middle-class family and need financial assistance to continue my studies. This scholarship will help me pursue my dream of becoming an engineer.",
    status: "pending",
    paymentStatus: "pending",
    createdAt: new Date(),
    updatedAt: new Date(),
  },
];

// Schemas (copy from server.js)
const applicationSchema = new mongoose.Schema({
  applicationId: { type: String, required: true, unique: true, index: true },
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, trim: true, lowercase: true },
  phone: { type: String, required: true, trim: true },
  dob: { type: Date, required: true },
  gender: {
    type: String,
    required: true,
    enum: ["Male / पुरुष", "Female / स्त्री", "Other / इतर"],
  },
  category: {
    type: String,
    required: true,
    enum: ["5वी–7वी", "8वी–12वी", "ITI", "Diploma", "Engineering"],
  },
  school: { type: String, required: true, trim: true },
  state: { type: String, required: true, trim: true },
  district: { type: String, required: true, trim: true },
  pincode: { type: String, required: true, trim: true },
  address: { type: String, required: true, trim: true },
  income_amount: { type: Number, required: true, min: 0 },
  income_band: {
    type: String,
    required: true,
    enum: [
      "Below ₹1,00,000",
      "₹1,00,000 – ₹3,00,000",
      "₹3,00,000 – ₹5,00,000",
      "Above ₹5,00,000",
    ],
  },
  achievements: { type: String, trim: true, default: "" },
  recommendation: { type: String, trim: true, default: "" },
  sop: { type: String, required: true, trim: true },
  status: {
    type: String,
    enum: ["pending", "paid", "verified", "selected", "rejected"],
    default: "pending",
  },
  paymentStatus: {
    type: String,
    enum: ["pending", "completed", "failed"],
    default: "pending",
  },
  paymentTransactionId: { type: String, default: null },
  score: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

const paymentSchema = new mongoose.Schema({
  applicationId: { type: String, required: true, index: true },
  merchantOrderId: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  phonePeTransactionId: { type: String, default: null },
  amount: { type: Number, required: true },
  status: {
    type: String,
    enum: ["initiated", "pending", "completed", "failed"],
    default: "initiated",
  },
  phonePeResponse: { type: Object, default: {} },
  callbackReceived: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

// Create indexes
applicationSchema.index({ createdAt: -1 });
applicationSchema.index({ email: 1, phone: 1 });
paymentSchema.index({ createdAt: -1 });

const Application = mongoose.model("Application", applicationSchema);
const Payment = mongoose.model("Payment", paymentSchema);

async function seedDatabase() {
  try {
    console.log("🌱 Starting database seeding...");

    // Clear existing test data
    await Application.deleteMany({ email: { $regex: "test@example.com" } });
    await Payment.deleteMany({ applicationId: { $regex: "TEST" } });

    console.log("🧹 Cleared existing test data");

    // Insert sample data only in development
    if (process.env.NODE_ENV !== "production") {
      await Application.insertMany(sampleApplications);
      console.log("✅ Sample applications inserted");
    }

    // Verify database structure
    const appCount = await Application.countDocuments();
    const paymentCount = await Payment.countDocuments();

    console.log(`📊 Database Status:`);
    console.log(`   Applications: ${appCount}`);
    console.log(`   Payments: ${paymentCount}`);

    // Test database operations
    console.log("🧪 Testing database operations...");

    // Test application creation
    const testApp = new Application({
      applicationId: "TEST_" + Date.now(),
      name: "Test User",
      email: "temp@test.com",
      phone: "9999999999",
      dob: new Date("2000-01-01"),
      gender: "Other / इतर",
      category: "Engineering",
      school: "Test College",
      state: "Test State",
      district: "Test District",
      pincode: "123456",
      address: "Test Address",
      income_amount: 100000,
      income_band: "Below ₹1,00,000",
      sop: "This is a test statement of purpose for database validation.",
    });

    const savedApp = await testApp.save();
    console.log("✅ Test application saved");

    // Clean up test data
    await Application.deleteOne({ _id: savedApp._id });
    console.log("🧹 Test data cleaned");

    console.log("🎉 Database seeding completed successfully!");
  } catch (error) {
    console.error("❌ Database seeding failed:", error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log("🔌 Database connection closed");
  }
}

// Health check function
async function healthCheck() {
  try {
    console.log("🏥 Performing database health check...");

    // Check connection
    const dbState = mongoose.connection.readyState;
    const states = {
      0: "disconnected",
      1: "connected",
      2: "connecting",
      3: "disconnecting",
    };

    console.log(`📡 Connection state: ${states[dbState]}`);

    if (dbState !== 1) {
      throw new Error("Database not connected");
    }

    // Check collections
    const collections = await mongoose.connection.db
      .listCollections()
      .toArray();
    console.log(
      `📚 Available collections: ${collections.map((c) => c.name).join(", ")}`,
    );

    // Check indexes
    const appIndexes = await Application.collection.getIndexes();
    console.log(
      `🔍 Application indexes: ${Object.keys(appIndexes).join(", ")}`,
    );

    console.log("✅ Database health check passed!");
  } catch (error) {
    console.error("❌ Database health check failed:", error);
    process.exit(1);
  }
}

// Run based on command line arguments
if (require.main === module) {
  const command = process.argv[2];

  switch (command) {
    case "seed":
      seedDatabase();
      break;
    case "health":
      healthCheck().then(() => mongoose.connection.close());
      break;
    default:
      console.log("Usage: node seedDatabase.js [seed|health]");
      console.log("  seed  - Seed database with sample data");
      console.log("  health - Check database connectivity");
      process.exit(1);
  }
}

module.exports = { seedDatabase, healthCheck };
