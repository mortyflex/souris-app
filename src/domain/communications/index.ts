// Souris — communication domain public entry point (Lots B and C1)

export { isUsableCommunicationEmail } from "./email";
export {
  communicationSmsPhoneIssue,
  isUsableCommunicationSmsPhone,
  normalizeCommunicationPhoneE164,
  type CommunicationSmsPhoneIssue,
} from "./phone";
