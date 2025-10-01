const mongoose = require("mongoose");
const nodemailer = require("nodemailer");
const crypto = require("crypto");
const axios = require("axios");
require("dotenv").config();

async function runCompleteTest() {
  console.log("🧪 Running Complete System Test...\n");

  const results = {
    database: false,
    email: false,
    phonepe: false,
  };

  // Test 1: Database Connection
  console.log("1️⃣ Testing MongoDB Atlas Connection...");
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 10000,
      bufferCommands: false,
    });

    await mongoose.connection.db.admin().ping();
    console.log("✅ MongoDB Atlas connected successfully!");
    console.log("Database name:", mongoose.connection.db.databaseName);
    results.database = true;

    await mongoose.connection.close();
  } catch (error) {
    console.log("❌ MongoDB connection failed:", error.message);
  }

  // Test 2: Email Configuration
  console.log("\n2️⃣ Testing Email Configuration...");
  try {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_APP_PASSWORD,
      },
    });

    await transporter.verify();
    console.log("✅ Gmail SMTP connection verified!");
    results.email = true;
  } catch (error) {
    console.log("❌ Email configuration failed:", error.message);
    if (error.message.includes("Invalid login")) {
      console.log(
        "🔧 Check your EMAIL_APP_PASSWORD - use Gmail App Password, not regular password",
      );
    }
  }

  // Test 3: PhonePe Connection (Test multiple URLs)
  console.log("\n3️⃣ Testing PhonePe Connection...");

  const testPayload = {
    merchantId: process.env.PHONEPE_MERCHANT_ID,
    merchantTransactionId: `TEST_${Date.now()}`,
    merchantUserId: `USER_TEST_${Date.now()}`,
    amount: 9900,
    redirectUrl: `${process.env.BACKEND_URL}/payment-status?transactionId=TEST_${Date.now()}`,
    redirectMode: "POST",
    callbackUrl: process.env.CALLBACK_URL,
    mobileNumber: "9999999999",
    paymentInstrument: {
      type: "PAY_PAGE",
    },
  };

  const base64Payload = Buffer.from(JSON.stringify(testPayload)).toString(
    "base64",
  );
  const endpoint = "/pg/v1/pay";
  const string = base64Payload + endpoint + process.env.PHONEPE_SALT_KEY;
  const sha256 = crypto.createHash("sha256").update(string).digest("hex");
  const xVerify = sha256 + "###" + process.env.PHONEPE_SALT_INDEX;

  // Test different production URLs
  const productionUrls = [
    "https://api.phonepe.com/apis/hermes",
    "https://mercury-t2.phonepe.com",
    "https://api.phonepe.com/apis/pg",
  ];

  const uatCredentials = {
    merchantId: "PGTESTPAYUAT86",
    saltKey: "96434309-7796-489d-8924-ab56988a6076",
    url: "https://api-preprod.phonepe.com/apis/pg-sandbox",
  };

  if (process.env.PHONEPE_ENV === "PROD") {
    console.log("Testing PRODUCTION environment...");

    for (let i = 0; i < productionUrls.length; i++) {
      const testUrl = productionUrls[i];
      console.log(
        `\n🔗 Testing URL ${i + 1}/${productionUrls.length}: ${testUrl}`,
      );

      try {
        const response = await axios.post(
          `${testUrl}${endpoint}`,
          { request: base64Payload },
          {
            headers: {
              "Content-Type": "application/json",
              "X-VERIFY": xVerify,
              accept: "application/json",
            },
            timeout: 10000,
          },
        );

        console.log(`✅ SUCCESS with URL: ${testUrl}`);
        console.log("Response success:", response.data.success);
        results.phonepe = true;

        if (response.data.data?.instrumentResponse?.redirectInfo?.url) {
          console.log("✅ Payment URL generated successfully");
        }

        console.log(`\n🎯 WORKING PRODUCTION URL: ${testUrl}`);
        break;
      } catch (error) {
        console.log(`❌ Failed with URL: ${testUrl}`);
        if (error.response?.data) {
          console.log(
            "Error:",
            error.response.data.code || error.response.data.message,
          );
        }
      }
    }

    if (!results.phonepe) {
      console.log("\n❌ All production URLs failed.");
      console.log("🔧 Possible solutions:");
      console.log(
        "1. Your merchant account may not be activated for production",
      );
      console.log(
        "2. Contact PhonePe Business Support: merchant-desk@phonepe.com",
      );
      console.log("3. Try UAT environment first to test integration");

      // Test with UAT as fallback
      console.log("\n🔄 Testing with UAT credentials as fallback...");

      const uatPayload = {
        ...testPayload,
        merchantId: uatCredentials.merchantId,
      };
      const uatBase64 = Buffer.from(JSON.stringify(uatPayload)).toString(
        "base64",
      );
      const uatString = uatBase64 + endpoint + uatCredentials.saltKey;
      const uatSha256 = crypto
        .createHash("sha256")
        .update(uatString)
        .digest("hex");
      const uatXVerify = uatSha256 + "###1";

      try {
        const uatResponse = await axios.post(
          `${uatCredentials.url}${endpoint}`,
          { request: uatBase64 },
          {
            headers: {
              "Content-Type": "application/json",
              "X-VERIFY": uatXVerify,
              accept: "application/json",
            },
            timeout: 10000,
          },
        );

        console.log(
          "✅ UAT connection successful! Your integration code works.",
        );
        console.log("Issue is with production merchant account activation.");
      } catch (uatError) {
        console.log("❌ Even UAT failed. Check your integration code.");
      }
    }
  } else {
    // UAT Testing
    console.log("Testing UAT environment...");
    console.log(`URL: ${uatCredentials.url}`);

    try {
      const response = await axios.post(
        `${uatCredentials.url}${endpoint}`,
        { request: base64Payload },
        {
          headers: {
            "Content-Type": "application/json",
            "X-VERIFY": xVerify,
            accept: "application/json",
          },
          timeout: 10000,
        },
      );

      console.log("✅ PhonePe UAT connection successful!");
      results.phonepe = true;
    } catch (error) {
      console.log("❌ PhonePe UAT connection failed");
      if (error.response?.data) {
        console.log("Error:", error.response.data);
      }
    }
  }

  // Summary
  console.log("\n📊 Test Results Summary:");
  console.log("Database:", results.database ? "✅ PASS" : "❌ FAIL");
  console.log("Email:", results.email ? "✅ PASS" : "❌ FAIL");
  console.log("PhonePe:", results.phonepe ? "✅ PASS" : "❌ FAIL");

  const passedTests = Object.values(results).filter(Boolean).length;
  console.log(`\nOverall: ${passedTests}/3 tests passed`);

  if (passedTests === 3) {
    console.log("🎉 All systems ready! You can start your server.");
  } else {
    console.log("⚠️ Fix the failing tests before starting your server.");
  }
}

runCompleteTest();
