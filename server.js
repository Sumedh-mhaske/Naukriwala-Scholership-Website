const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const validator = require("validator");
const nodemailer = require("nodemailer");
const axios = require("axios");
const crypto = require("crypto");
require("dotenv").config();

const app = express();

// ✅ PERFECT CORS - This will fix everything!
app.use(
  cors({
    origin: "*",
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  }),
);

// Express middleware (REMOVE DUPLICATE)
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// Rate Limiting
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: "Too many requests from this IP, please try again later.",
});

const paymentLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 10,
  message: "Too many payment requests, please try again later.",
});

app.use(generalLimiter);

// PhonePe V2 Configuration
const PHONEPE_CONFIG = {
  clientId: process.env.PHONEPE_CLIENT_ID,
  clientVersion: process.env.PHONEPE_CLIENT_VERSION,
  clientSecret: process.env.PHONEPE_CLIENT_SECRET,
  merchantId: process.env.PHONEPE_MERCHANT_ID,
  saltKey: process.env.PHONEPE_SALT_KEY,
  saltIndex: process.env.PHONEPE_SALT_INDEX || "1",
  env: process.env.PHONEPE_ENV || "PROD",
};

// PhonePe V2 URLs
const PHONEPE_URLS = {
  UAT: {
    token: "https://api-preprod.phonepe.com/apis/pg-sandbox/v1/oauth/token",
    payment: "https://api-preprod.phonepe.com/apis/pg-sandbox/checkout/v2/pay",
    status: "https://api-preprod.phonepe.com/apis/pg-sandbox/checkout/v2/order",
  },
  PROD: {
    token: "https://api.phonepe.com/apis/identity-manager/v1/oauth/token",
    payment: "https://api.phonepe.com/apis/pg/checkout/v2/pay",
    status: "https://api.phonepe.com/apis/pg/checkout/v2/order",
  },
};

// MongoDB connection (KEEP ONLY ONE VERSION)
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
  family: 4,
  retryWrites: true,
  retryReads: true,
  maxPoolSize: 10,
  bufferMaxEntries: 0,
  bufferCommands: false,
});

const db = mongoose.connection;
db.on("error", (error) => {
  console.error("❌ MongoDB connection error:", error.message);
  console.error("💡 Check if Render IPs are whitelisted in MongoDB Atlas");
});
db.once("open", () => {
  console.log("✅ Connected to MongoDB");
  fixDatabaseIndexes(); // Make sure this function exists later in your file
});
db.on("disconnected", () => {
  console.log("📡 MongoDB disconnected. Attempting to reconnect...");
});

// Continue with your schemas, routes, etc...

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

// const db = mongoose.connection;
db.on("error", (error) => console.error("❌ MongoDB connection error:", error));
db.once("open", () => console.log("✅ Connected to MongoDB"));

// Schemas
const applicationSchema = new mongoose.Schema({
  applicationId: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  email: { type: String, required: true },
  phone: { type: String, required: true },
  dob: { type: Date, required: true },
  gender: {
    type: String,
    required: true,
    enum: ["Male / पुरुष", "Female / स्त्री", "Other / इतर"],
  },
  category: { type: String, required: true },
  school: { type: String, required: true },
  state: { type: String, required: true },
  district: { type: String, required: true },
  pincode: { type: String, required: true },
  address: { type: String, required: true },
  income_amount: { type: Number, required: true },
  income_band: { type: String, required: true },
  achievements: { type: String, required: true },
  recommendation: { type: String, required: true },
  sop: { type: String, required: true },
  status: {
    type: String,
    enum: ["pending", "paid", "approved", "rejected"],
    default: "pending",
  },
  paymentStatus: {
    type: String,
    enum: ["pending", "completed", "failed"],
    default: "pending",
  },
  paymentOrderId: { type: String },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

const paymentSchema = new mongoose.Schema({
  applicationId: { type: String, required: true },
  merchantOrderId: { type: String, required: true, unique: true }, // Keep this name
  phonePeOrderId: { type: String },
  amount: { type: Number, required: true },
  status: {
    type: String,
    enum: ["initiated", "pending", "completed", "failed"],
    default: "initiated",
  },
  phonePeResponse: { type: Object },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

// Add this after your MongoDB connection in server.js:

async function fixDatabaseIndexes() {
  try {
    console.log("🔧 Checking and fixing database indexes...");

    // Get the payments collection
    const paymentsCollection = mongoose.connection.db.collection("payments");

    // Get existing indexes
    const indexes = await paymentsCollection.indexes();
    console.log(
      "📋 Current indexes:",
      indexes.map((idx) => idx.name),
    );

    // Drop the problematic old index if it exists
    try {
      await paymentsCollection.dropIndex("merchantTransactionId_1");
      console.log("🗑️ Dropped old merchantTransactionId index");
    } catch (error) {
      if (error.code === 27) {
        console.log("✅ Old index doesn't exist - no need to drop");
      } else {
        console.log("⚠️ Error dropping index:", error.message);
      }
    }

    // Ensure correct indexes exist
    await paymentsCollection.createIndex(
      { merchantOrderId: 1 },
      { unique: true },
    );
    console.log("✅ Created merchantOrderId unique index");

    await paymentsCollection.createIndex({ applicationId: 1, status: 1 });
    console.log("✅ Created applicationId+status index");

    await paymentsCollection.createIndex({ status: 1, createdAt: -1 });
    console.log("✅ Created status+createdAt index");

    console.log("🎉 Database indexes fixed successfully!");
  } catch (error) {
    console.error("❌ Error fixing database indexes:", error);
  }
}

// Call this after MongoDB connection is established
db.once("open", () => {
  console.log("✅ Connected to MongoDB");
  fixDatabaseIndexes(); // Add this line
});

// Indexes
applicationSchema.index({ email: 1, phone: 1 });
applicationSchema.index({ status: 1, createdAt: -1 });
applicationSchema.index({ paymentStatus: 1, createdAt: -1 });
applicationSchema.index({ applicationId: 1 }, { unique: true });

// Update indexes to match
paymentSchema.index({ merchantOrderId: 1 }, { unique: true }); // Keep this name
paymentSchema.index({ applicationId: 1, status: 1 });
paymentSchema.index({ status: 1, createdAt: -1 });

const Application = mongoose.model("Application", applicationSchema);
const Payment = mongoose.model("Payment", paymentSchema);

// Email Configuration
let emailTransporter = null;
if (process.env.EMAIL_USER && process.env.EMAIL_APP_PASSWORD) {
  emailTransporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_APP_PASSWORD,
    },
  });
  console.log("✅ Email server ready");
} else {
  console.warn("⚠️ Email credentials not configured");
}

// Token cache
let tokenCache = {
  token: null,
  expiresAt: 0,
};

// OAuth V2 Token Generation (WORKING VERSION)
async function generateAuthToken() {
  try {
    // Check if we have a valid cached token
    if (tokenCache.token && Date.now() < tokenCache.expiresAt - 60000) {
      console.log("🔄 Using cached OAuth token");
      return tokenCache.token;
    }

    const tokenEndpoint = PHONEPE_URLS[PHONEPE_CONFIG.env].token;

    // Working OAuth V2 format
    const requestBodyJson = {
      client_version: PHONEPE_CONFIG.clientVersion,
      grant_type: "client_credentials",
      client_id: PHONEPE_CONFIG.clientId,
      client_secret: PHONEPE_CONFIG.clientSecret,
    };

    const requestBody = new URLSearchParams(requestBodyJson).toString();

    console.log("🔐 Generating OAuth V2 token with working credentials...");
    console.log("🔍 Client ID:", PHONEPE_CONFIG.clientId);
    console.log("🔍 Endpoint:", tokenEndpoint);

    const response = await axios.post(tokenEndpoint, requestBody, {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      timeout: 30000,
    });

    if (response.data && response.data.access_token) {
      console.log("✅ OAuth V2 token generated successfully!");

      // Cache the token
      tokenCache.token = response.data.access_token;
      tokenCache.expiresAt = response.data.expires_at * 1000; // Convert to milliseconds

      console.log("🕒 Token expires at:", new Date(tokenCache.expiresAt));
      return response.data.access_token;
    } else {
      throw new Error(
        "Token generation failed: " + JSON.stringify(response.data),
      );
    }
  } catch (error) {
    console.error("❌ OAuth token generation error:");
    console.error("Status:", error.response?.status);
    console.error("Response:", JSON.stringify(error.response?.data, null, 2));

    // Clear cache on error
    tokenCache.token = null;
    tokenCache.expiresAt = 0;

    throw error;
  }
}

// Input sanitization and validation functions (same as before)
function sanitizeInput(req, res, next) {
  if (req.body) {
    for (let key in req.body) {
      if (typeof req.body[key] === "string") {
        req.body[key] = req.body[key].trim();
      }
    }
  }
  next();
}

function validateEmail(email) {
  return validator.isEmail(email);
}

function validatePhoneNumber(phone) {
  const phoneRegex = /^[6-9]\d{9}$/;
  return phoneRegex.test(phone);
}

function validateApplicationData(data) {
  const errors = [];

  if (!data.name?.trim()) errors.push("Name is required");
  if (!data.email?.trim()) errors.push("Email is required");
  if (!validateEmail(data.email)) errors.push("Invalid email format");
  if (!data.phone?.trim()) errors.push("Phone number is required");
  if (!validatePhoneNumber(data.phone))
    errors.push("Invalid Indian phone number");
  if (!data.dob) errors.push("Date of birth is required");
  if (!data.gender) errors.push("Gender is required");
  if (!data.category) errors.push("Class/Course is required");
  if (!data.school?.trim()) errors.push("School/College name is required");
  if (!data.state?.trim()) errors.push("State is required");
  if (!data.district?.trim()) errors.push("District is required");
  if (!data.pincode?.trim()) errors.push("Pincode is required");
  if (!data.address?.trim()) errors.push("Address is required");
  if (!data.income_amount) errors.push("Family income is required");
  if (!data.income_band) errors.push("Income band is required");
  if (!data.achievements?.trim()) errors.push("Achievements are required");
  if (!data.recommendation?.trim()) errors.push("Recommendation is required");
  if (!data.sop?.trim()) errors.push("Statement of purpose is required");
  if (data.sop && data.sop.length < 50)
    errors.push("Statement of purpose must be at least 50 characters");

  return errors;
}

// Find the checkDuplicatePayment function and update it:

async function checkDuplicatePayment(applicationId, timeWindowMinutes = 30) {
  const cutoffTime = new Date(Date.now() - timeWindowMinutes * 60 * 1000);

  const existingPayment = await Payment.findOne({
    applicationId,
    status: { $in: ["completed"] }, // Only block if payment is completed
    createdAt: { $gte: cutoffTime },
  });

  return existingPayment;
}

async function sendConfirmationEmail(application, orderId) {
  if (!emailTransporter) {
    console.log("Email not configured, skipping confirmation email");
    return;
  }

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: application.email,
    subject: "Scholarship Application Confirmed - Naukrivalaa Foundation",
    html: `
      <h2>Application Received Successfully!</h2>
      <p>Dear ${application.name},</p>
      <p>Your scholarship application has been successfully submitted and payment received.</p>
      <p><strong>Application Details:</strong></p>
      <ul>
        <li>Application ID: <strong>${application.applicationId}</strong></li>
        <li>Payment Order ID: <strong>${orderId}</strong></li>
        <li>Amount Paid: ₹99</li>
        <li>Status: Under Review</li>
      </ul>
      <p>We will contact you soon regarding the next steps.</p>
      <p>Best regards,<br>Naukrivalaa Foundation Team</p>
    `,
  };

  try {
    await emailTransporter.sendMail(mailOptions);
    console.log(`Confirmation email sent to ${application.email}`);
  } catch (error) {
    console.error("Failed to send confirmation email:", error.message);
  }
}

// Routes

// Health Check
app.get("/health", async (req, res) => {
  const health = {
    status: "OK",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || "development",
    database:
      mongoose.connection.readyState === 1 ? "connected" : "disconnected",
    email: emailTransporter ? "configured" : "not configured",
    phonepe: PHONEPE_CONFIG.clientId ? "configured" : "not configured",
    phonePeEnv: PHONEPE_CONFIG.env,
    method: "OAuth V2 (Working)",
    client_id: PHONEPE_CONFIG.clientId,
  };
  res.json(health);
});

// Application Submission (same as before)
app.post(
  "/api/application/submit",
  generalLimiter,
  sanitizeInput,
  async (req, res) => {
    try {
      const errors = validateApplicationData(req.body);
      if (errors.length > 0) {
        return res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: errors,
        });
      }

      const existingApplication = await Application.findOne({
        $or: [{ email: req.body.email }, { phone: req.body.phone }],
      });

      if (existingApplication) {
        return res.status(409).json({
          success: false,
          message: "Application already exists with this email or phone number",
        });
      }

      const applicationId = `NF2025${Date.now()}${Math.floor(Math.random() * 1000)}`;

      const application = new Application({
        ...req.body,
        applicationId,
        dob: new Date(req.body.dob),
      });

      await application.save();

      res.status(201).json({
        success: true,
        message: "Application submitted successfully",
        data: {
          applicationId: application.applicationId,
          timestamp: application.createdAt,
        },
      });
    } catch (error) {
      console.error("Application submission error:", error);
      res.status(500).json({
        success: false,
        message: "Application submission failed",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  },
);

// Payment Initiation (OAuth V2 - WORKING VERSION)
// FIXED VERSION - Replace your payment initiation route with this:

app.post(
  "/api/payment/initiate",
  paymentLimiter,
  sanitizeInput,
  async (req, res) => {
    try {
      const { applicationId, amount, name, email, phone, merchantOrderId } =
        req.body;

      // Validation
      if (
        !applicationId ||
        !amount ||
        !name ||
        !email ||
        !phone ||
        !merchantOrderId
      ) {
        return res.status(400).json({
          success: false,
          message: "Missing required fields",
        });
      }

      if (amount !== 99) {
        return res.status(400).json({
          success: false,
          message: "Invalid amount",
        });
      }

      // CHECK FOR EXISTING PAYMENT FIRST (BEFORE CREATING NEW ONE)
      const existingPayment = await Payment.findOne({ merchantOrderId });
      if (existingPayment) {
        return res.status(409).json({
          success: false,
          message: "Payment already exists for this order ID",
          existingPayment: {
            merchantOrderId: existingPayment.merchantOrderId,
            status: existingPayment.status,
            createdAt: existingPayment.createdAt,
          },
        });
      }

      // Check for duplicate payments by application
      const duplicatePayment = await checkDuplicatePayment(applicationId);
      if (duplicatePayment) {
        return res.status(409).json({
          success: false,
          message: `Payment already exists for this application. Status: ${duplicatePayment.status}`,
          existingPayment: {
            merchantOrderId: duplicatePayment.merchantOrderId,
            status: duplicatePayment.status,
            createdAt: duplicatePayment.createdAt,
          },
        });
      }

      // Generate OAuth token
      const authToken = await generateAuthToken();

      // V2 Payment payload
      // In your payment initiation route, ensure the payload matches V2 format exactly:
      const requestBody = {
        merchantOrderId: merchantOrderId,
        amount: amount * 100, // Convert to paisa
        expireAfter: 1800, // 30 minutes
        metaInfo: {
          udf1: applicationId,
          udf2: name,
          udf3: email,
          udf4: phone,
          udf5: "Scholarship Application",
        },
        paymentFlow: {
          type: "PG_CHECKOUT",
          message: "Naukrivalaa Foundation Scholarship Application Fee",
          merchantUrls: {
            redirectUrl: `${process.env.BACKEND_URL}/payment-status?transactionId=${merchantOrderId}`,
          },
        },
      };

      const requestHeaders = {
        "Content-Type": "application/json",
        Authorization: `O-Bearer ${authToken}`,
      };

      console.log("🔍 DEBUG - PhonePe V2 Payment Request (OAuth):");
      console.log("URL:", PHONEPE_URLS[PHONEPE_CONFIG.env].payment);
      console.log("Payload:", JSON.stringify(requestBody, null, 2));

      const response = await axios.post(
        PHONEPE_URLS[PHONEPE_CONFIG.env].payment,
        requestBody,
        {
          headers: requestHeaders,
          timeout: 30000,
        },
      );

      console.log("✅ PhonePe V2 Payment Response (OAuth):", response.data);

      if (response.data && response.data.redirectUrl && response.data.orderId) {
        // NOW SAVE THE PAYMENT (AFTER SUCCESSFUL PHONEPE RESPONSE)
        const payment = new Payment({
          applicationId,
          merchantOrderId,
          phonePeOrderId: response.data.orderId,
          amount: amount * 100,
          status: "initiated",
          phonePeResponse: response.data,
        });
        await payment.save();

        res.json({
          success: true,
          message: "Payment initiated successfully",
          data: {
            orderId: response.data.orderId,
            redirectUrl: response.data.redirectUrl,
            state: response.data.state,
            expireAt: response.data.expireAt,
          },
        });
      } else {
        throw new Error(
          "Invalid PhonePe response: " + JSON.stringify(response.data),
        );
      }
    } catch (error) {
      console.error(
        "Payment initiation error:",
        error.response?.data || error.message,
      );

      let errorMessage = "Payment initiation failed";
      if (error.response?.data?.message) {
        errorMessage = error.response.data.message;
      } else if (error.response?.data?.code) {
        errorMessage = `PhonePe Error: ${error.response.data.code}`;
      }

      res.status(500).json({
        success: false,
        message: errorMessage,
        error:
          process.env.NODE_ENV === "development"
            ? error.response?.data || error.message
            : undefined,
      });
    }
  },
);

// Payment Status Check (OAuth V2 - WORKING VERSION)
app.get("/api/payment/status/:merchantOrderId", async (req, res) => {
  try {
    const { merchantOrderId } = req.params;

    if (!merchantOrderId) {
      return res.status(400).json({
        success: false,
        message: "Order ID is required",
      });
    }

    // Find local payment record - use correct field name
    const localPayment = await Payment.findOne({ merchantOrderId }); // Make sure this matches
    if (!localPayment) {
      return res.status(404).json({
        success: false,
        message: "Payment record not found",
      });
    }

    // Generate fresh auth token
    const authToken = await generateAuthToken();

    // V2 Status endpoint
    const requestHeaders = {
      "Content-Type": "application/json",
      Authorization: `O-Bearer ${authToken}`,
    };

    const statusUrl = `${PHONEPE_URLS[PHONEPE_CONFIG.env].status}/${merchantOrderId}/status?details=true&errorContext=true`;

    console.log("🔍 DEBUG - V2 Status URL:", statusUrl);

    const response = await axios.get(statusUrl, {
      headers: requestHeaders,
      timeout: 30000,
    });

    console.log("✅ PhonePe V2 Status Response:", response.data);

    const orderState = response.data.state;
    let localStatus = "initiated";
    let applicationStatus = "pending";
    let shouldSendEmail = false;

    // Handle order states
    switch (orderState) {
      case "COMPLETED":
        localStatus = "completed";
        applicationStatus = "paid";
        shouldSendEmail = localPayment.status !== "completed";
        break;

      case "FAILED":
        localStatus = "failed";
        applicationStatus = "pending";
        break;

      case "PENDING":
        localStatus = "pending";
        applicationStatus = "pending";
        break;

      default:
        console.warn(`Unknown order state: ${orderState}`);
        localStatus = "pending";
        applicationStatus = "pending";
    }

    // Update payment record - use correct field name
    const updatedPayment = await Payment.findOneAndUpdate(
      { merchantOrderId }, // Use this consistently
      {
        status: localStatus,
        phonePeOrderId: response.data.orderId,
        phonePeResponse: response.data,
        updatedAt: new Date(),
      },
      { new: true },
    );

    // Update application status
    const application = await Application.findOneAndUpdate(
      { applicationId: localPayment.applicationId },
      {
        paymentStatus: localStatus === "completed" ? "completed" : "pending",
        paymentOrderId:
          orderState === "COMPLETED" ? response.data.orderId : null,
        status: applicationStatus,
        updatedAt: new Date(),
      },
      { new: true },
    );

    // Send confirmation email for successful payments
    if (shouldSendEmail && orderState === "COMPLETED" && application) {
      try {
        await sendConfirmationEmail(application, response.data.orderId);
        console.log(
          `Confirmation email sent for application: ${application.applicationId}`,
        );
      } catch (emailError) {
        console.error("Failed to send confirmation email:", emailError.message);
      }
    }

    res.json({
      success: true,
      data: response.data,
      localData: {
        applicationId: updatedPayment.applicationId,
        status: updatedPayment.status,
        createdAt: updatedPayment.createdAt,
        updatedAt: updatedPayment.updatedAt,
      },
    });
  } catch (error) {
    console.error(
      "Payment status check error:",
      error.response?.data || error.message,
    );

    let errorMessage = "Payment status check failed";
    if (error.response?.data?.message) {
      errorMessage = error.response.data.message;
    } else if (error.response?.data?.code) {
      errorMessage = `PhonePe Error: ${error.response.data.code}`;
    }

    res.status(500).json({
      success: false,
      message: errorMessage,
      error:
        process.env.NODE_ENV === "development"
          ? error.response?.data || error.message
          : undefined,
    });
  }
});

// Payment Status Page (same as before)
app.get("/payment-status", (req, res) => {
  const { transactionId } = req.query;

  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
        <title>Payment Status - Naukrivalaa Foundation</title>
        <style>
            body { font-family: Arial, sans-serif; margin: 40px; text-align: center; }
            .container { max-width: 600px; margin: 0 auto; }
            .loading { color: #007bff; }
            .success { color: #28a745; }
            .error { color: #dc3545; }
            .pending { color: #ffc107; }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>Payment Status</h1>
            <div id="status" class="loading">Checking payment status...</div>
            <div id="details"></div>
        </div>
        
        <script>
            const transactionId = "${transactionId}";
            
            async function checkStatus() {
                try {
                    const response = await fetch(\`/api/payment/status/\${transactionId}\`);
                    const result = await response.json();
                    
                    if (result.success) {
                        const state = result.data.state;
                        const statusDiv = document.getElementById('status');
                        const detailsDiv = document.getElementById('details');
                        
                        if (state === 'COMPLETED') {
                            statusDiv.className = 'success';
                            statusDiv.innerHTML = '✅ Payment Successful!';
                            detailsDiv.innerHTML = \`
                                <p>Your scholarship application fee has been paid successfully.</p>
                                <p><strong>Order ID:</strong> \${result.data.orderId}</p>
                                <p><strong>Amount:</strong> ₹\${result.data.amount / 100}</p>
                                <p>You will receive a confirmation email shortly.</p>
                            \`;
                        } else if (state === 'PENDING') {
                            statusDiv.className = 'pending';
                            statusDiv.innerHTML = '⏳ Payment Pending';
                            detailsDiv.innerHTML = '<p>Your payment is being processed. Please wait...</p>';
                            setTimeout(checkStatus, 3000);
                        } else if (state === 'FAILED') {
                            statusDiv.className = 'error';
                            statusDiv.innerHTML = '❌ Payment Failed';
                            detailsDiv.innerHTML = '<p>Payment failed. Please try again or contact support.</p>';
                        }
                    } else {
                        document.getElementById('status').innerHTML = '❌ Error checking payment status';
                        document.getElementById('details').innerHTML = \`<p>\${result.message}</p>\`;
                    }
                } catch (error) {
                    document.getElementById('status').innerHTML = '❌ Network error';
                    document.getElementById('details').innerHTML = '<p>Please refresh the page to try again.</p>';
                }
            }
            
            checkStatus();
        </script>
    </body>
    </html>
  `);
});

// Application Details
app.get("/api/application/:applicationId", async (req, res) => {
  try {
    const { applicationId } = req.params;
    const application = await Application.findOne({ applicationId });

    if (!application) {
      return res.status(404).json({
        success: false,
        message: "Application not found",
      });
    }

    res.json({
      success: true,
      data: application,
    });
  } catch (error) {
    console.error("Application fetch error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch application",
    });
  }
});

// Add this temporary endpoint to your server.js for cleanup:

app.post("/api/admin/clear-payments", async (req, res) => {
  try {
    // WARNING: This will delete all payment records
    const result = await Payment.deleteMany({});
    console.log(
      "🗑️ Cleared payments collection:",
      result.deletedCount,
      "records",
    );

    res.json({
      success: true,
      message: `Cleared ${result.deletedCount} payment records`,
      deletedCount: result.deletedCount,
    });
  } catch (error) {
    console.error("Error clearing payments:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Add this temporary debug endpoint:
app.get("/api/debug/schema", async (req, res) => {
  try {
    // Get payment collection info
    const paymentCount = await Payment.countDocuments({});
    const samplePayment = await Payment.findOne({});

    console.log("Payment collection stats:");
    console.log("Count:", paymentCount);
    console.log("Sample record:", samplePayment);

    res.json({
      success: true,
      paymentCount,
      samplePayment,
      schemaFields: Object.keys(Payment.schema.paths),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Add this cleanup endpoint to your server.js:

app.post("/api/admin/clear-applications", async (req, res) => {
  try {
    const email = req.body.email;
    const phone = req.body.phone;

    if (email || phone) {
      // Clear specific user
      const query = {};
      if (email) query.email = email;
      if (phone) query.phone = phone;

      const result = await Application.deleteOne(query);
      console.log("🗑️ Cleared specific application:", result);

      res.json({
        success: true,
        message: `Cleared application for ${email || phone}`,
        deletedCount: result.deletedCount,
      });
    } else {
      // Clear all applications (BE CAREFUL!)
      const result = await Application.deleteMany({});
      console.log(
        "🗑️ Cleared all applications:",
        result.deletedCount,
        "records",
      );

      res.json({
        success: true,
        message: `Cleared ${result.deletedCount} application records`,
        deletedCount: result.deletedCount,
      });
    }
  } catch (error) {
    console.error("Error clearing applications:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Add this endpoint to your server.js:
app.post("/api/admin/clear-payment", async (req, res) => {
  try {
    const { merchantOrderId } = req.body;

    if (merchantOrderId) {
      const result = await Payment.deleteOne({ merchantOrderId });
      console.log("🗑️ Cleared specific payment:", merchantOrderId);

      res.json({
        success: true,
        message: `Cleared payment ${merchantOrderId}`,
        deletedCount: result.deletedCount,
      });
    } else {
      res.status(400).json({
        success: false,
        message: "merchantOrderId required",
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Add this temporary cleanup endpoint to your server.js:
app.delete("/api/admin/cleanup-user/:email", async (req, res) => {
  try {
    const { email } = req.params;

    console.log(`🧹 Cleaning up data for user: ${email}`);

    // Clear payments for this user's applications
    const userApplications = await Application.find({ email });
    const applicationIds = userApplications.map((app) => app.applicationId);

    const paymentDeleteResult = await Payment.deleteMany({
      applicationId: { $in: applicationIds },
    });

    // Clear applications for this user
    const appDeleteResult = await Application.deleteMany({ email });

    console.log(`🗑️ Deleted ${paymentDeleteResult.deletedCount} payments`);
    console.log(`🗑️ Deleted ${appDeleteResult.deletedCount} applications`);

    res.json({
      success: true,
      message: `Cleaned up data for ${email}`,
      deleted: {
        payments: paymentDeleteResult.deletedCount,
        applications: appDeleteResult.deletedCount,
      },
    });
  } catch (error) {
    console.error("Cleanup error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Add this endpoint for complete database reset:
app.post("/api/admin/reset-database", async (req, res) => {
  try {
    console.log("🗑️ RESETTING ENTIRE DATABASE...");

    // Clear all collections
    await Application.deleteMany({});
    await Payment.deleteMany({});

    // Drop and recreate collections to fix indexes
    await mongoose.connection.db
      .collection("applications")
      .drop()
      .catch(() => {});
    await mongoose.connection.db
      .collection("payments")
      .drop()
      .catch(() => {});

    console.log("✅ Database reset complete");

    res.json({
      success: true,
      message: "Database reset successfully - all data cleared",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Add this COMPLETE database reset endpoint:
app.post("/api/admin/nuclear-reset", async (req, res) => {
  try {
    console.log("💥 NUCLEAR RESET - Clearing everything...");

    // Drop entire collections to remove all indexes and data
    try {
      await mongoose.connection.db.collection("payments").drop();
      console.log("🗑️ Dropped payments collection completely");
    } catch (e) {
      console.log("⚠️ Payments collection didn't exist");
    }

    try {
      await mongoose.connection.db.collection("applications").drop();
      console.log("🗑️ Dropped applications collection completely");
    } catch (e) {
      console.log("⚠️ Applications collection didn't exist");
    }

    // Wait a moment
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Force recreate the models to rebuild proper indexes
    delete mongoose.connection.models.Payment;
    delete mongoose.connection.models.Application;

    // Recreate models with correct schemas
    const Application = mongoose.model("Application", applicationSchema);
    const Payment = mongoose.model("Payment", paymentSchema);

    console.log("✅ Collections dropped and models recreated");
    console.log("✅ Fresh database ready for testing");

    res.json({
      success: true,
      message: "Nuclear reset complete - database is completely fresh",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("❌ Nuclear reset error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📋 Health check: http://localhost:${PORT}/health`);
  console.log(
    `💳 Payment endpoint: http://localhost:${PORT}/api/payment/initiate`,
  );
  console.log(`📧 Email configured: ${emailTransporter ? "Yes" : "No"}`);
  console.log(`🔒 PhonePe Environment: ${PHONEPE_CONFIG.env}`);
  console.log(`🔐 Authentication Method: OAuth V2 (Working!)`);
  console.log(`🆔 Client ID: ${PHONEPE_CONFIG.clientId}`);
  console.log(`💾 Database: Connecting...`);
});
