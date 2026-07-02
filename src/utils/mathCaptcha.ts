/**
 * Math Captcha Utility
 * Generates and validates simple math-based captchas
 */

export interface MathCaptcha {
  question: string;
  answer: number;
  expression: string;
}

/**
 * Generates a simple math captcha with addition, subtraction, or multiplication
 * @returns MathCaptcha object containing question, answer, and expression
 */
export function generateMathCaptcha(): MathCaptcha {
  // Operations: 0 = addition, 1 = subtraction, 2 = multiplication
  const operation = Math.floor(Math.random() * 3);

  // Generate two random numbers between 1 and 20
  const num1 = Math.floor(Math.random() * 20) + 1;
  const num2 = Math.floor(Math.random() * 20) + 1;

  let question: string;
  let answer: number;
  let expression: string;

  switch (operation) {
    case 0: // Addition
      question = `What is ${num1} + ${num2}?`;
      answer = num1 + num2;
      expression = `${num1}+${num2}`;
      break;
    case 1: // Subtraction
      // Ensure we don't have negative results
      if (num1 < num2) {
        question = `What is ${num2} - ${num1}?`;
        answer = num2 - num1;
        expression = `${num2}-${num1}`;
      } else {
        question = `What is ${num1} - ${num2}?`;
        answer = num1 - num2;
        expression = `${num1}-${num2}`;
      }
      break;
    case 2: // Multiplication
      question = `What is ${num1} × ${num2}?`;
      answer = num1 * num2;
      expression = `${num1}*${num2}`;
      break;
    default:
      // Fallback to addition
      question = `What is ${num1} + ${num2}?`;
      answer = num1 + num2;
      expression = `${num1}+${num2}`;
  }

  return {
    question,
    answer,
    expression,
  };
}

/**
 * Validates a user's answer against the captcha
 * @param userAnswer - The answer provided by the user
 * @param correctAnswer - The correct answer from the captcha
 * @returns boolean indicating if the answer is correct
 */
export function validateMathCaptcha(
  userAnswer: number,
  correctAnswer: number
): boolean {
  return userAnswer === correctAnswer;
}
