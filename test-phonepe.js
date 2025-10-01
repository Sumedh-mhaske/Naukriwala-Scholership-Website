const crypto = require("crypto");
const axios = require("axios");
require("dotenv").config();

async function testPhonePeConnection() {
  console.log("🧪 Testing PhonePe Configuration...");
  console.log("Merchant ID:", process.env.PHONEPE_MERCHANT_ID);
  console.log(
    "Salt Key:",
    process.env.PHONEPE_SALT_KEY ? "✓ Present" : "❌ Missing",
  );
  console.log("Environment:", process.env.PHONEPE_ENV);

  // Test payload
  const testPayload = {
    merchantId: process.env.PHONEPE_MERCHANT_ID,
    merchantTransactionId: `TEST_${Date.now()}`,
    merchantUserId: `USER_TEST_${Date.now()}`,
    amount: 9900, // ₹99 in paise
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

  const phonePeUrl =
    process.env.PHONEPE_ENV === "UAT"
      ? "https://api-preprod.phonepe.com/apis/pg-sandbox"
      : "https://api.phonepe.com/apis/hermes";

  try {
    console.log("🔗 Testing connection to:", phonePeUrl);

    const response = await axios.post(
      `${phonePeUrl}${endpoint}`,
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

    console.log("✅ PhonePe Connection Successful!");
    console.log("Success:", response.data.success);

    if (response.data.data?.instrumentResponse?.redirectInfo?.url) {
      console.log("✅ Payment URL generated successfully");
      console.log(
        "Payment URL:",
        response.data.data.instrumentResponse.redirectInfo.url,
      );
    }

    return true;
  } catch (error) {
    console.log("❌ PhonePe Connection Failed:");

    if (error.response?.data) {
      console.log("Error Response:", error.response.data);

      if (error.response.data.message?.includes("Invalid Merchant")) {
        console.log("🔧 Solution: Check your PHONEPE_MERCHANT_ID in .env file");
      } else if (error.response.data.message?.includes("Invalid signature")) {
        console.log("🔧 Solution: Check your PHONEPE_SALT_KEY in .env file");
      }
    } else {
      console.log("Error:", error.message);
    }

    return false;
  }
}

testPhonePeConnection();
