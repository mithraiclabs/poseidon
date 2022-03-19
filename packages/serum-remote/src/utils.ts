import { parseIdlErrors, ProgramError } from "@project-serum/anchor";
import { IDL } from "./serum_remote";

const idlErrors = parseIdlErrors(IDL);

export const parseTranactionError = (error: any) =>
  ProgramError.parse(error, idlErrors);
