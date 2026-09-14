const crypto = require("crypto");
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
    // Get payment details sent by payment.html
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      expected_amount
    } = JSON.parse(event.body || "{}");

    // Check required values
    if (
      !razorpay_order_id ||
      !razorpay_payment_id ||
      !razorpay_signature
    ) {
      return {
        statusCode: 400,
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          success: false,
          message: "Missing Razorpay payment details."
        })
      };
    }

    // Check that Razorpay secret exists in Netlify
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

    // Create Razorpay instance
    const razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET
    });

    // --------------------------------------------------
    // STEP 1: Verify Razorpay signature
    // --------------------------------------------------

    const generatedSignature = crypto
      .createHmac(
        "sha256",
        process.env.RAZORPAY_KEY_SECRET
      )
      .update(
        `${razorpay_order_id}|${razorpay_payment_id}`
      )
      .digest("hex");

    // Compare signatures safely
    const signatureBuffer = Buffer.from(
      generatedSignature,
      "utf8"
    );

    const receivedSignatureBuffer = Buffer.from(
      razorpay_signature,
      "utf8"
    );

    if (
      signatureBuffer.length !==
      receivedSignatureBuffer.length
    ) {
      return {
        statusCode: 400,
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          success: false,
          message: "Payment signature verification failed."
        })
      };
    }

    const signatureValid = crypto.timingSafeEqual(
      signatureBuffer,
      receivedSignatureBuffer
    );

    if (!signatureValid) {
      return {
        statusCode: 400,
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          success: false,
          message: "Invalid Razorpay payment signature."
        })
      };
    }

    // --------------------------------------------------
    // STEP 2: Fetch the Razorpay order
    // --------------------------------------------------

    const order = await razorpay.orders.fetch(
      razorpay_order_id
    );

    if (!order || !order.id) {
      return {
        statusCode: 400,
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          success: false,
          message: "Razorpay order could not be found."
        })
      };
    }

    // --------------------------------------------------
    // STEP 3: Fetch the Razorpay payment
    // --------------------------------------------------

    const payment = await razorpay.payments.fetch(
      razorpay_payment_id
    );

    if (!payment || !payment.id) {
      return {
        statusCode: 400,
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          success: false,
          message: "Razorpay payment could not be found."
        })
      };
    }

    // --------------------------------------------------
    // STEP 4: Verify order ID
    // --------------------------------------------------

    if (payment.order_id !== razorpay_order_id) {
      return {
        statusCode: 400,
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          success: false,
          message: "Payment does not belong to this order."
        })
      };
    }

    // --------------------------------------------------
    // STEP 5: Verify amount
    // --------------------------------------------------

    const orderAmount = Number(order.amount);
    const paymentAmount = Number(payment.amount);

    if (
      !Number.isFinite(orderAmount) ||
      !Number.isFinite(paymentAmount)
    ) {
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

    // expected_amount is sent from payment.html in rupees.
    // Razorpay stores amount in paise.
    if (expected_amount !== undefined) {
      const expectedAmountPaise =
        Math.round(Number(expected_amount) * 100);

      if (
        !Number.isFinite(expectedAmountPaise) ||
        expectedAmountPaise !== orderAmount
      ) {
        return {
          statusCode: 400,
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            success: false,
            message: "Expected amount does not match Razorpay order."
          })
        };
      }
    }

    // Make sure payment amount matches order amount
    if (paymentAmount !== orderAmount) {
      return {
        statusCode: 400,
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          success: false,
          message: "Payment amount does not match order amount."
        })
      };
    }

    // --------------------------------------------------
    // STEP 6: Verify payment status
    // --------------------------------------------------

    if (payment.status !== "captured") {
      return {
        statusCode: 400,
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          success: false,
          message:
            `Payment is not captured. Current status: ${payment.status}`
        })
      };
    }

    // --------------------------------------------------
    // PAYMENT VERIFIED
    // --------------------------------------------------

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        success: true,
        message: "Payment verified successfully.",
        order_id: razorpay_order_id,
        payment_id: razorpay_payment_id,
        amount: orderAmount / 100,
        currency: order.currency || "INR",
        status: payment.status
      })
    };

  } catch (error) {
    console.error(
      "Razorpay verification error:",
      error
    );

    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        success: false,
        message:
          "Unable to verify payment.",
        error:
          process.env.NODE_ENV === "development"
            ? error.message
            : undefined
      })
    };
  }
};
