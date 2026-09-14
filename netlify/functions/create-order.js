const Razorpay = require("razorpay");

exports.handler = async (event) => {
  // Only allow POST requests
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        success: false,
        message: "Method Not Allowed"
      })
    };
  }

  try {
    // Check Razorpay environment variables
    if (!process.env.RAZORPAY_KEY_ID) {
      return {
        statusCode: 500,
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          success: false,
          message: "RAZORPAY_KEY_ID is not configured in Netlify."
        })
      };
    }

    if (!process.env.RAZORPAY_KEY_SECRET) {
      return {
        statusCode: 500,
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          success: false,
          message: "RAZORPAY_KEY_SECRET is not configured in Netlify."
        })
      };
    }

    // Read data sent from payment.html
    const {
      amount,
      receipt,
      customerName,
      email,
      phone,
      resumeName
    } = JSON.parse(event.body || "{}");

    // Convert amount to number
    const rupees = Number(amount);

    // Validate amount
    if (!Number.isFinite(rupees) || rupees <= 0) {
      return {
        statusCode: 400,
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          success: false,
          message: "Invalid payment amount."
        })
      };
    }

    // Safety limit
    if (rupees > 1000000) {
      return {
        statusCode: 400,
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          success: false,
          message: "Payment amount is too large."
        })
      };
    }

    // Create Razorpay instance
    const razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET
    });

    // Razorpay requires amount in paise
    const amountInPaise = Math.round(rupees * 100);

    // Create Razorpay order
    const order = await razorpay.orders.create({
      amount: amountInPaise,
      currency: "INR",
      receipt: String(
        receipt || `CVX-${Date.now()}`
      ).slice(0, 40),

      notes: {
        customer_name: String(
          customerName || ""
        ).slice(0, 200),

        email: String(
          email || ""
        ).slice(0, 200),

        phone: String(
          phone || ""
        ).slice(0, 50),

        resume_name: String(
          resumeName || ""
        ).slice(0, 200)
      }
    });

    // Return order information to payment.html
    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        success: true,
        order_id: order.id,
        amount: order.amount,
        currency: order.currency,
        key_id: process.env.RAZORPAY_KEY_ID
      })
    };

  } catch (error) {
    console.error(
      "Razorpay create order error:",
      error
    );

    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        success: false,
        message: "Unable to create Razorpay order.",
        error: error.message
      })
    };
  }
};
