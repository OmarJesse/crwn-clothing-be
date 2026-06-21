import express from "express";
import createPaymentIntentResolver from "../controllers/payment/createPaymentIntentResolver";

const router = express.Router();

router.post("/payments/create-payment-intent", createPaymentIntentResolver);

export default router;
