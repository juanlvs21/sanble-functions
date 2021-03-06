import { VercelRequest, VercelResponse } from "@vercel/node";
import {
  OK,
  METHOD_NOT_ALLOWED,
  UNPROCESSABLE_ENTITY,
  INTERNAL_SERVER_ERROR,
  CREATED,
} from "http-status";
import { v1 as uuidv1 } from "uuid";

// Types
import { TUserRecord } from "../../types/TUserRecord";

// Utils
import { valid } from "../../utils/validator";
import { auth } from "../../utils/firebase";
import { welcomeEmail } from "../../utils/sgMain";

export default async (req: VercelRequest, res: VercelResponse) => {
  try {
    if (req.method === "OPTIONS") {
      res.status(OK).end();
    } else if (req.method === "POST") {
      const body =
        typeof req.body === "string" ? JSON.parse(req.body) : req.body;

      const validator = await valid(body, {
        displayName: ["required"],
        email: ["required", "email"],
        password: ["required", "password"],
        confirmPassword: ["required"],
      });
      if (!validator.valid)
        return res.status(UNPROCESSABLE_ENTITY).json({
          statusCode: UNPROCESSABLE_ENTITY,
          message: "Fields validation error",
          data: validator.errors,
        });

      // Extract data
      const { displayName, email, password, confirmPassword } = body;

      // The password does not match
      if (password !== confirmPassword)
        return res.status(UNPROCESSABLE_ENTITY).json({
          statusCode: UNPROCESSABLE_ENTITY,
          message: "The password does not match",
          data: ["La contraseña no coincide"],
        });

      const uuid = uuidv1();

      const user: TUserRecord = await auth.createUser({
        uid: uuid,
        email,
        emailVerified: false,
        password,
        displayName,
        disabled: false,
      });

      const verificationLink: string = await auth.generateEmailVerificationLink(
        user.email
      );

      await welcomeEmail(user.email, user.displayName, verificationLink);

      res.status(CREATED).json({
        statusCode: CREATED,
        message: "Successfully registered user",
        data: {
          user: {
            uid: user.uid,
            email: user.email,
            emailVerified: user.emailVerified,
            displayName: user.displayName,
            disabled: user.disabled,
            metadata: user.metadata,
          },
        },
      });
    } else {
      res.status(METHOD_NOT_ALLOWED).json({
        statusCode: METHOD_NOT_ALLOWED,
        message: "Method Not Allowed",
      });
    }
  } catch (error) {
    console.error(error);

    if (error.errorInfo) {
      if (error.errorInfo.code === "auth/email-already-exists")
        return res.status(UNPROCESSABLE_ENTITY).json({
          statusCode: UNPROCESSABLE_ENTITY,
          message: "Firebase:auth/email-already-exists",
          data: ["El correo electrónico ya se encuentra en uso."],
        });
      else if (error.errorInfo.code === "auth/internal-error")
        return res.status(INTERNAL_SERVER_ERROR).json({
          statusCode: INTERNAL_SERVER_ERROR,
          message: "Firebase:auth/internal-error",
          data: ["Error interno del servidor."],
        });
      else
        return res.status(INTERNAL_SERVER_ERROR).json({
          statusCode: INTERNAL_SERVER_ERROR,
          message: "Firebase:Unknown error",
          data: ["Error desconocido."],
        });
    } else {
      return res.status(INTERNAL_SERVER_ERROR).json({
        statusCode: INTERNAL_SERVER_ERROR,
        message: "Internal Server Error",
      });
    }
  }
};
