import { Request, Response, NextFunction } from "express";
import { getCache, setCache } from "../utils/redis";
import { generateMathCaptcha, validateMathCaptcha } from "../utils/mathCaptcha";
import AppError from "../utils/appError";
import { nanoid } from "nanoid";
/**
 * Middleware to generate a math captcha and store it in Redis
 * @param req
 * @param res
 * @param next
 */
export async function generateCaptcha(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    
    const captcha = generateMathCaptcha();

  


    const token = nanoid(20);
    

    // Store the captcha answer in Redis with a 10-minute expiration
    await setCache(
      `captcha:${token}`,
      captcha.answer.toString(),
      600
    );

  
   
    return res.status(200).json({
      status: "success",
      data: {
        token,
        question: captcha.question,
      },
    });
  } catch (error) {
    next(new AppError("Failed to generate captcha", 500));
  }
}

/**
 * Middleware to validate the user's captcha answer
 * @param req
 * @param res
 * @param next
 */
export async function validateCaptcha(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { captchaToken, captchaAnswer } = req.body;

    
    if (!captchaToken || captchaAnswer === undefined) {
      return res.status(400).json({
        status: "error",
        message: "Captcha token and answer are required",
      });
    }

    
    const correctAnswerStr = await getCache(`captcha:${captchaToken}`);


    if (!correctAnswerStr) {
      return res.status(400).json({
        status: "error",
        message: "Captcha has expired or is invalid. Please request a new captcha.",
      });
    }

    
    const correctAnswer = parseInt(correctAnswerStr as string, 10);
    const userAnswer = parseInt(captchaAnswer as unknown as string, 10);


    if (isNaN(userAnswer) || !validateMathCaptcha(userAnswer, correctAnswer)) {
      return res.status(400).json({
        status: "error",
        message: "Incorrect captcha answer. Please try again.",
      });
    }

 
    next();
  } catch (error) {
    next(new AppError("Failed to validate captcha", 500));
  }
}
