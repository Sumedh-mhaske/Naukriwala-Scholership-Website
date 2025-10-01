const nodemailer = require("nodemailer");
require("dotenv").config();

async function testEmail() {
  console.log("🧪 Testing Email Configuration...");
  console.log("Email User:", process.env.EMAIL_USER);
  console.log(
    "App Password:",
    process.env.EMAIL_APP_PASSWORD ? "✓ Present" : "❌ Missing",
  );

  if (!process.env.EMAIL_USER || !process.env.EMAIL_APP_PASSWORD) {
    console.log("❌ Email credentials missing in .env file");
    console.log("🔧 Please set EMAIL_USER and EMAIL_APP_PASSWORD in .env");
    return false;
  }

  const transporter = nodemailer.createTransport({
    // ← Fixed: createTransport
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_APP_PASSWORD,
    },
  });

  try {
    console.log("🔗 Verifying SMTP connection...");
    await transporter.verify();
    console.log("✅ Email server connection verified!");

    // Send test email
    console.log("📧 Sending test email...");
    const result = await transporter.sendMail({
      from: `"Naukrivalaa Foundation" <${process.env.EMAIL_USER}>`,
      to: process.env.EMAIL_USER,
      subject: "🎉 Test Email - Scholarship Website Setup Complete",
      html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: #4ade80;">✅ Email Configuration Working!</h2>
                    <p>Your scholarship website email is configured correctly.</p>
                    <div style="background: #f0f9ff; padding: 20px; border-radius: 10px; margin: 20px 0;">
                        <h3>Test Details:</h3>
                        <ul>
                            <li><strong>Date:</strong> ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}</li>
                            <li><strong>Environment:</strong> ${process.env.NODE_ENV || "development"}</li>
                            <li><strong>Email Service:</strong> Gmail SMTP</li>
                        </ul>
                    </div>
                    <p style="color: #666;">This email confirms your scholarship application system is ready to send confirmation emails to students.</p>
                </div>
            `,
    });

    console.log("✅ Test email sent successfully!");
    console.log("Message ID:", result.messageId);
    console.log("📬 Check your inbox for the test email");

    return true;
  } catch (error) {
    console.log("❌ Email configuration failed:");
    console.log("Error:", error.message);

    if (error.message.includes("Invalid login")) {
      console.log("🔧 Solution: Check your EMAIL_USER and EMAIL_APP_PASSWORD");
      console.log(
        "🔧 Make sure you generated an App Password from Google Account settings",
      );
    } else if (error.message.includes("Less secure app")) {
      console.log(
        "🔧 Solution: Enable 2FA and use App Password instead of regular password",
      );
    }

    return false;
  }
}

testEmail();
