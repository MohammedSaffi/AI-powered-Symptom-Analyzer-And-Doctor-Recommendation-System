import Cerebras from "@cerebras/cerebras_cloud_sdk";
import { Router } from "express";

const router = Router();

// Initialize Cerebras
const cerebras = new Cerebras({
  apiKey: "csk-vr2e85ym5tw4me5x6tvxyfeycphvxjhx93m3vrhetfmdrrjm",
});

// Test route
router.get("/test", (req, res) => {
  res.send("test running");
});

// Handle POST request to Cerebras
router.post("/search", async (req, res) => {
  try {
    const { query, history = [], level = "initial", context } = req.body;

    console.log("Received query:", query, "Level:", level, "Context:", context);

    if (!query) {
      return res.status(400).json({
        error: "Please provide a question or describe your symptoms.",
      });
    }

    // Detect query type
    const queryType = detectQueryType(query, context);
    console.log("Detected query type:", queryType);

    // Build messages with appropriate context
    let messages = [
      {
        role: "system",
        content: getSystemPrompt(queryType, level),
      },
    ];

    // Add conversation history
    if (history.length > 0) {
      messages = messages.concat(history);
    }

    // Add current user message with context
    let userMessage = query;
    if (context) {
      userMessage = `Context: Previous symptoms were "${context.originalSymptoms}".\n\nCurrent question: ${query}`;
    }

    messages.push({
      role: "user",
      content: userMessage,
    });

    const response = await cerebras.chat.completions.create({
      messages: messages,
      model: "llama3.1-8b",
    });

    const result = response.choices[0].message.content;

    // Check if response requires follow-up
    const requiresFollowUp =
      result.includes("Would you like") ||
      result.includes("Do you need") ||
      result.includes("Can you tell me");

    // Check if AI indicated it doesn't know
    const notTrained =
      result.includes("I haven't been trained") ||
      result.includes("I don't have information") ||
      result.includes("beyond my knowledge");

    // Check if asking for location
    const askingLocation =
      result.includes("your location") ||
      result.includes("your locality") ||
      result.includes("where are you located");

    res.json({
      success: true,
      response: result,
      queryType: queryType,
      requiresFollowUp: requiresFollowUp && !notTrained,
      level: level,
      notTrained: notTrained,
      askingLocation: askingLocation,
    });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({
      error: "An error occurred while processing your request.",
    });
  }
});

// Detect the type of query
function detectQueryType(query, context) {
  const lowerQuery = query.toLowerCase();

  // Check for location responses
  if (
    lowerQuery.includes("i live in") ||
    lowerQuery.includes("my location is") ||
    lowerQuery.includes("i am located in") ||
    lowerQuery.includes("near") ||
    lowerQuery.includes("locality")
  ) {
    return "location_provided";
  }

  // Check for follow-up responses
  if (
    lowerQuery.includes("yes, i have more symptoms") ||
    lowerQuery.includes("i also have") ||
    lowerQuery.includes("additional symptoms")
  ) {
    return "more_symptoms";
  }

  if (
    lowerQuery.includes("tell me more details") ||
    lowerQuery.includes("more information") ||
    lowerQuery.includes("explain further") ||
    lowerQuery.includes("what could be serious") ||
    lowerQuery.includes("worst case") ||
    lowerQuery.includes("severe conditions")
  ) {
    return "more_details";
  }

  if (
    lowerQuery.includes("what specialist") ||
    lowerQuery.includes("which doctor") ||
    lowerQuery.includes("what type of doctor")
  ) {
    return "specialist_recommendation";
  }

  if (
    lowerQuery.includes("home care") ||
    lowerQuery.includes("home remedies") ||
    lowerQuery.includes("what can i do at home") ||
    lowerQuery.includes("self care")
  ) {
    return "home_care";
  }

  // Check for duration/severity responses
  if (
    lowerQuery.includes("for") &&
    (lowerQuery.includes("days") ||
      lowerQuery.includes("weeks") ||
      lowerQuery.includes("months"))
  ) {
    return "duration_provided";
  }

  if (
    lowerQuery.includes("severity") ||
    lowerQuery.includes("pain level") ||
    lowerQuery.includes("scale of") ||
    (lowerQuery.includes("/") && /\d+/.test(lowerQuery))
  ) {
    return "severity_provided";
  }

  // Check for hospital/clinic requests
  if (
    lowerQuery.includes("hospital") ||
    lowerQuery.includes("clinic") ||
    lowerQuery.includes("nearest medical") ||
    lowerQuery.includes("emergency room")
  ) {
    return "hospital_request";
  }

  // Check for general medical questions
  if (
    lowerQuery.includes("what is") ||
    lowerQuery.includes("explain") ||
    lowerQuery.includes("how does") ||
    lowerQuery.includes("why does")
  ) {
    return "general_question";
  }

  // Default to symptom analysis
  return "symptom_analysis";
}

// Get appropriate system prompt based on query type
function getSystemPrompt(queryType, level) {
  const basePrompt = `You are MediAI, a compassionate and knowledgeable medical assistant. Your goal is to help patients understand their health concerns without causing unnecessary alarm. Always be supportive and clear in your responses.`;

  switch (queryType) {
    case "symptom_analysis":
      if (level === "initial") {
        return (
          basePrompt +
          `
        IMPORTANT: Start with the most common, benign explanations.
        ONLY mention: cold, flu, stress, fatigue, mild indigestion, tension headache, muscle strain, etc.
        NEVER mention serious diseases in first response.
        
        CRITICAL: Always ask these specific follow-up questions:
        1. How long have you been experiencing these symptoms? (Duration)
        2. On a scale of 1-10, how severe are your symptoms? (Severity)
        3. Do you have any other related symptoms? (Additional symptoms)
        
        End with: "Would you like to tell me more about these symptoms so I can provide better guidance?"
        
        Always include: "Note: This is not a medical diagnosis. Please consult a healthcare professional for proper evaluation."
        `
        );
      }
      break;

    case "duration_provided":
    case "severity_provided":
      return (
        basePrompt +
        `
      Thank the patient for providing the information.
      Analyze the duration and severity in context.
      If you have duration and severity, ask about:
      - Any other symptoms they're experiencing
      - Whether symptoms are getting better or worse
      - Any recent changes in their life (diet, stress, travel, etc.)
      
      End with: "Would you like to tell me more about these symptoms so I can provide better guidance?"
      
      Always include: "Note: This is not a medical diagnosis. Please consult a healthcare professional for proper evaluation."
      `
      );

    case "more_symptoms":
      return (
        basePrompt +
        `
      The patient is providing additional symptoms. Analyze these new symptoms along with the context.
      Update your assessment considering all symptoms together.
      Still focus on common conditions first, but you can now consider moderately common issues.
      
      If you have enough information, start suggesting:
      - The most likely type of doctor to consult
      - Whether they should seek immediate care
      
      End with: "Would you like to tell me more about these symptoms so I can provide better guidance?"
      
      Always include: "Note: This is not a medical diagnosis. Please consult a healthcare professional for proper evaluation."
      `
      );

    case "more_details":
      return (
        basePrompt +
        `
      PROVIDE COMPREHENSIVE MEDICAL INFORMATION INCLUDING SERIOUS CONDITIONS.
      
      Structure your response in THREE SECTIONS:
      
      1. MOST COMMON CONDITIONS (Likely causes):
      - List and explain common/benign conditions first
      - Include: colds, flu, stress, mild infections, etc.
      
      2. MODERATELY SERIOUS CONDITIONS:
      - Include conditions that require medical attention but aren't immediately life-threatening
      - Examples: sinus infections, migraines, gastritis, bronchitis, pneumonia, kidney stones, gallstones, etc.
      
      3. RARE BUT SERIOUS CONDITIONS (Critical Warning Signs):
      - IMPORTANT: Include rare but serious diseases that could present with these symptoms
      - Examples:
        * For persistent headaches: brain tumor, meningitis, aneurysm
        * For chest pain: heart attack, pulmonary embolism, aortic dissection
        * For abdominal pain: appendicitis, pancreatitis, ovarian torsion, ectopic pregnancy
        * For fever: sepsis, meningitis, endocarditis
        * For joint pain: rheumatoid arthritis, lupus, septic arthritis
        * For breathing issues: pulmonary embolism, COPD, lung cancer
        * For neurological symptoms: stroke, MS, Guillain-Barré syndrome
        * For fatigue: leukemia, lymphoma, heart failure, kidney disease
        * For weight loss: cancer, hyperthyroidism, diabetes, HIV/AIDS
      
      CRITICAL: For each serious condition, include:
      - "RARE BUT POSSIBLE" warning label
      - Specific red flag symptoms that would indicate this condition
      - IMMEDIATE action required (e.g., "GO TO ER IMMEDIATELY if...")
      
      Include recommendations for specialists and when to seek emergency care.
      
      Ask: "Based on your symptoms, which type of doctor would you like to consult? (General Physician, Specialist, Emergency Care)"
      
      Always include: "⚠️ MEDICAL DISCLAIMER: This information is for educational purposes only. Serious conditions require immediate medical attention. Please consult a healthcare professional for proper diagnosis and treatment."
      `
      );

    case "specialist_recommendation":
      return (
        basePrompt +
        `
      Based on the symptoms discussed, recommend the most appropriate medical specialists.
      Explain why each specialist would be helpful.
      Include both primary care and specialty options when relevant.
      
      If symptoms could indicate serious conditions, emphasize urgency:
      - "If you experience [specific red flags], seek emergency care immediately"
      - "These symptoms could potentially indicate serious conditions including [list 2-3 serious possibilities]"
      
      Then ask: "To help you find the nearest healthcare facility, could you please tell me your location or locality?"
      
      Always include: "Note: This is not a medical diagnosis. Please consult a healthcare professional for proper evaluation."
      `
      );

    case "location_provided":
      return (
        basePrompt +
        `
      The patient has provided their location. Provide helpful information about:
      - Types of healthcare facilities available in their area
      - General guidance on finding nearby hospitals/clinics
      - What to look for in a healthcare provider
      - Emergency services contact information
      
      If their symptoms could be serious, include:
      "Given your symptoms, I strongly recommend visiting [type of facility] as soon as possible. These symptoms could potentially indicate serious conditions that require immediate evaluation."
      
      Since I cannot access real-time location data, suggest:
      - Using Google Maps to search "hospitals near [their location]"
      - Calling emergency services if it's an emergency
      - Checking with local health department for facilities
      
      Ask: "Would you like me to help you prepare for your doctor visit with some questions to ask?"
      
      Always include: "Note: This is not a medical diagnosis. Please consult a healthcare professional for proper evaluation."
      `
      );

    case "hospital_request":
      return (
        basePrompt +
        `
      The patient is looking for hospitals/clinics. Provide guidance on:
      - How to find emergency care vs. regular appointments
      - What to consider when choosing a hospital
      - Emergency warning signs that require immediate ER visit
      
      CRITICAL: List specific emergency symptoms that require IMMEDIATE ER visit:
      - Chest pain/pressure
      - Difficulty breathing
      - Sudden severe headache
      - Weakness/numbness on one side
      - Confusion or difficulty speaking
      - High fever with stiff neck
      - Severe abdominal pain
      - Uncontrolled bleeding
      
      Explain: "These symptoms could indicate life-threatening conditions like heart attack, stroke, meningitis, or internal bleeding. DO NOT WAIT - go to ER or call emergency services."
      
      Ask: "What is your current location or city? I can provide general guidance on finding healthcare facilities in your area."
      
      Always include: "Note: This is not a medical diagnosis. In case of emergency, call your local emergency number immediately."
      `
      );

    case "home_care":
      return (
        basePrompt +
        `
      Provide safe, practical home care suggestions for the discussed symptoms.
      Include:
      - Immediate comfort measures
      - Over-the-counter medication options (with cautions)
      - Lifestyle adjustments
      - WARNING SIGNS that require immediate professional help
      
      CRITICAL: List symptoms that mean "STOP HOME CARE AND SEEK IMMEDIATE MEDICAL ATTENTION":
      - Fever over 103°F (39.4°C)
      - Symptoms lasting more than 7-10 days
      - Severe pain that doesn't improve
      - Difficulty breathing
      - Confusion or disorientation
      - Uncontrolled bleeding
      
      Explain: "These could indicate serious infections, organ failure, or other life-threatening conditions."
      
      Ask: "Have you been able to measure your temperature? Do you have any medications at home?"
      
      Always include: "Note: This is not a medical diagnosis. Please consult a healthcare professional for proper evaluation."
      `
      );

    default:
      return (
        basePrompt +
        `
      Provide helpful, accurate medical information.
      Be supportive and clear.
      If the question is about extremely rare conditions, provide what information you can while emphasizing the need for specialist consultation.
      
      For any symptom discussion, include:
      - Common explanations
      - When to be concerned
      - Red flag symptoms requiring immediate care
      
      Always include: "Note: This is not a medical diagnosis. Please consult a healthcare professional for proper evaluation."
      `
      );
  }
}

export const mediAI = router;
