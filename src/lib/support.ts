export type SupportCategory = "question" | "bug" | "account" | "feature_request" | "other";

export const SUPPORT_PATH = "/support/";

export const supportCopy = {
  eyebrow: "Support",
  title: "How can we help?",
  metaDescription:
    "Contact {app} support: email us or send a request, and find answers about subscriptions, your account and privacy.",
  lead: "Questions, bugs or ideas about {app}? Write to us and a real person will reply by email.",
  emailLabel: "Email us",
  emailNote: "We reply within two business days.",
  form: {
    title: "Send a request",
    email: "Your email",
    category: "Topic",
    subject: "Subject",
    message: "Message",
    submit: "Send request",
    sent: "Thanks! Your request has reached us. We'll reply to the email you gave.",
    error: "Something went wrong. Please try again or email us directly.",
    invalid: "Please fill in your email, a subject and a message.",
    captcha: "Please complete the security check and try again.",
  },
  categories: {
    question: "Question",
    bug: "Something doesn't work",
    account: "Account and sign-in",
    feature_request: "Idea or suggestion",
    other: "Other",
  } satisfies Record<SupportCategory, string>,
  faqTitle: "Common questions",
  faq: {
    cancel: {
      question: "How do I cancel my subscription?",
      answer:
        "Subscriptions are managed by the store you bought them in. On iPhone or iPad open Settings → your name → Subscriptions. On Android open Google Play → profile icon → Payments & subscriptions → Subscriptions. Deleting {app} does not cancel a subscription.",
    },
    restore: {
      question: "I paid, but my subscription is not active",
      answer:
        "Sign in with the same account you used before, then open the subscription screen in {app} and tap Restore purchase. If it still does not work, send us a request with the email of your {app} account.",
    },
    deleteAccount: {
      question: "How do I delete my account?",
      answer: "You can delete it in the app under Settings → Account → Delete account, or without the app on our website.",
      linkLabel: "Delete account",
    },
    privacy: {
      question: "What data do you keep?",
      answer: "Our privacy policy lists what {app} collects, why, and how long it is kept.",
      linkLabel: "Privacy policy",
    },
  },
};
