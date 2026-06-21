import { Request, Response, NextFunction } from "express";
import Stripe from "stripe";

/**
 * POST /payments/create-payment-intent
 * Body: { amount: number }  — amount in the smallest currency unit (cents).
 *
 * Creates a Stripe PaymentIntent and returns its client_secret for the
 * front-end to confirm with stripe.confirmCardPayment(). The secret key is
 * read from STRIPE_SECRET_KEY at call time so a missing key fails loudly with
 * a clear 500 rather than crashing the process at boot.
 */
const createPaymentIntentResolver = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) {
      res
        .status(500)
        .json({ error: "Stripe is not configured (missing STRIPE_SECRET_KEY)." });
      return;
    }

    const amount = Number(req.body?.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      res.status(400).json({ error: "A positive integer amount is required." });
      return;
    }

    const stripe = new Stripe(secretKey);

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount),
      currency: "usd",
      automatic_payment_methods: { enabled: true, allow_redirects: "never" },
    });

    res.status(200).json({ paymentIntent });
  } catch (error) {
    next(error);
  }
};

export default createPaymentIntentResolver;
