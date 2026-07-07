import { nanoid } from 'nanoid';
import Room from '../models/Room.js';
import Problem from '../models/Problem.js';

export const createRoom = async (req, res) => {
  try {
    const { problemSource, problemId, customProblem, selectedQuestions, duration, defaultLanguage } = req.body;
    const createdBy = req.user.id;

    if (problemSource === 'bank' && !problemId) {
      return res.status(400).json({ error: 'Problem ID is required for bank problems' });
    }
    if (problemSource === 'custom' && (!customProblem?.title || !customProblem?.description)) {
      return res.status(400).json({ error: 'Title and description are required for custom problems' });
    }

    const initialSelectedQuestions = selectedQuestions || [{
      problemSource,
      problemId: problemSource === 'bank' ? problemId : null,
      customProblem: problemSource === 'custom' ? customProblem : null
    }];

    const roomId = nanoid(8);
    const room = new Room({
      roomId,
      createdBy,
      interviewerId: createdBy,
      problemSource,
      problemId: problemSource === 'bank' ? problemId : null,
      customProblem: problemSource === 'custom' ? customProblem : null,
      selectedQuestions: initialSelectedQuestions,
      duration,
      defaultLanguage,
      currentLanguage: defaultLanguage
    });

    await room.save();
    res.status(201).json({ roomId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

export const getRoom = async (req, res) => {
  try {
    const { roomId } = req.params;
    const room = await Room.findOne({ roomId })
      .populate('problemId')
      .populate('selectedQuestions.problemId')
      .populate('interviewerId')
      .populate('candidateId');
    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }

    const problemsToProcess = [];
    if (room.problemId) problemsToProcess.push(room.problemId);
    if (room.selectedQuestions) {
      for (const sq of room.selectedQuestions) {
        if (sq.problemSource === 'bank' && sq.problemId) {
          problemsToProcess.push(sq.problemId);
        }
      }
    }
    if (problemsToProcess.length > 0) {
      await ensureProblemDescriptions(problemsToProcess);
    }

    res.status(200).json({ room });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

export const getPastSessions = async (req, res) => {
  try {
    const userId = req.user.id;
    const rooms = await Room.find({
      $or: [{ interviewerId: userId }, { candidateId: userId }]
    })
      .populate('problemId')
      .populate('selectedQuestions.problemId')
      .populate('interviewerId')
      .populate('candidateId')
      .sort({ createdAt: -1 });
    res.status(200).json({ rooms });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

export const deleteRoom = async (req, res) => {
  try {
    const { roomId } = req.params;
    const userId = req.user.id;

    const room = await Room.findOne({ roomId });
    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }

    // Only the interviewer who created the room can delete it
    if (room.interviewerId.toString() !== userId) {
      return res.status(403).json({ error: 'Only the interviewer can delete this session' });
    }

    // Prevent deleting active sessions
    if (room.status === 'active') {
      return res.status(400).json({ error: 'Cannot delete an active session. End it first.' });
    }

    await Room.deleteOne({ roomId });
    res.status(200).json({ message: 'Session deleted successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

export const getProblems = async (req, res) => {
  try {
    const problems = await Problem.find({});
    res.status(200).json({ problems });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

export const getRoomReport = async (req, res) => {
  try {
    const { roomId } = req.params;
    const userId = req.user.id;

    const room = await Room.findOne({ roomId })
      .populate('problemId')
      .populate('selectedQuestions.problemId')
      .populate('interviewerId')
      .populate('candidateId');
    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }

    // Check permissions: only interviewer or candidate
    // After .populate(), interviewerId is a full User document, so use ._id
    const interviewerIdStr = room.interviewerId?._id?.toString() || room.interviewerId?.toString();
    const candidateIdStr = room.candidateId?._id?.toString() || room.candidateId?.toString();
    if (interviewerIdStr !== userId && (!candidateIdStr || candidateIdStr !== userId)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    if (!room.feedbackReport) {
      return res.status(202).json({ status: 'generating' });
    }

    res.status(200).json({ feedbackReport: room.feedbackReport, room });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

export const getTurnCredentials = async (req, res) => {
  try {
    const meteredApiKey = process.env.METERED_API_KEY;
    const meteredDomain = process.env.METERED_DOMAIN; // e.g. "your-app.metered.live"

    // If Metered credentials are configured, fetch dynamic TURN servers
    if (meteredApiKey && meteredDomain) {
      try {
        const response = await fetch(
          `https://${meteredDomain}/api/v1/turn/credentials?apiKey=${meteredApiKey}`
        );
        if (response.ok) {
          const iceServers = await response.json();
          return res.status(200).json({ iceServers });
        }
      } catch (fetchErr) {
        console.error('Failed to fetch Metered TURN credentials:', fetchErr);
        // Fall through to static env var fallback
      }
    }

    // Fallback: use static TURN_URL/USERNAME/CREDENTIAL env vars if set
    const turnUrl = process.env.TURN_URL;
    if (turnUrl && turnUrl.startsWith('turn')) {
      return res.status(200).json({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          {
            urls: turnUrl,
            username: process.env.TURN_USERNAME || '',
            credential: process.env.TURN_CREDENTIAL || ''
          }
        ]
      });
    }

    // No TURN configured — return STUN only
    res.status(200).json({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

export const generateFeedbackReport = async (roomId) => {
  try {
    const room = await Room.findOne({ roomId }).populate('problemId').populate('selectedQuestions.problemId');
    if (!room) {
      console.error(`generateFeedbackReport: Room ${roomId} not found`);
      return;
    }

    const language = room.currentLanguage || room.defaultLanguage || 'javascript';
    const code = room.currentCode || '// No code submitted';
    const notes = room.interviewerNotes || 'No notes provided';

    const promptText = `You are an experienced technical interviewer evaluating a candidate's performance in a coding interview session.

You are given:
1. The final code the candidate wrote during the session (language: ${language})
2. A snapshot image of the shared whiteboard used during the session
3. Private notes from the interviewer

Evaluate the candidate's performance and return a structured JSON object with EXACTLY this format and no other text, no markdown, no backticks:

{
  "overallScore": <number from 1 to 10>,
  "summary": "<2-3 sentence overall summary of the candidate's performance>",
  "categories": [
    {
      "name": "Problem Understanding",
      "score": <1-10>,
      "feedback": "<2-3 sentences>"
    },
    {
      "name": "Approach & Design",
      "score": <1-10>,
      "feedback": "<2-3 sentences>"
    },
    {
      "name": "Code Quality",
      "score": <1-10>,
      "feedback": "<2-3 sentences>"
    },
    {
      "name": "Communication & Clarity",
      "score": <1-10>,
      "feedback": "<2-3 sentences>"
    },
    {
      "name": "Areas for Improvement",
      "score": null,
      "feedback": "<3-4 sentences with specific, actionable suggestions>"
    }
  ]
}

Code submitted:
${code}

Interviewer notes:
${notes}`;

    const parts = [{ text: promptText }];
    if (room.whiteboardSnapshot && room.whiteboardSnapshot !== "data:," && room.whiteboardSnapshot.includes(',')) {
      const base64Data = room.whiteboardSnapshot.split(',')[1];
      if (base64Data && base64Data.trim() !== '') {
        parts.push({
          inlineData: {
            mimeType: 'image/png',
            data: base64Data
          }
        });
      }
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error("Missing GEMINI_API_KEY in environment variables");
      room.feedbackReport = { error: true, message: "Report generation failed. Missing Gemini API key in configuration." };
      await room.save();
      // Emit report-ready event so frontend updates UI with the error
      const { getIo } = await import('../socket/socketHandler.js');
      const io = getIo();
      if (io) io.to(roomId).emit('report-ready', { roomId });
      return;
    }

    let parsedReport = null;
    
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const apiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey
          },
          body: JSON.stringify({
            contents: [{ parts }],
            generationConfig: {
              responseMimeType: "application/json"
            }
          })
        });

        if (!apiResponse.ok) {
          const errText = await apiResponse.text();
          console.error(`Gemini API error body:`, errText);
          throw new Error(`Gemini API status ${apiResponse.status}`);
        }

        const data = await apiResponse.json();
        let responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
        responseText = responseText.trim();

        if (responseText.startsWith("```json")) {
          responseText = responseText.substring(7);
        } else if (responseText.startsWith("```")) {
          responseText = responseText.substring(3);
        }
        if (responseText.endsWith("```")) {
          responseText = responseText.substring(0, responseText.length - 3);
        }
        responseText = responseText.trim();

        parsedReport = JSON.parse(responseText);
        break;
      } catch (apiErr) {
        console.error(`Attempt ${attempt} failed:`, apiErr);
        if (attempt === 2) throw apiErr;
      }
    }

    room.feedbackReport = parsedReport;
    await room.save();

    const { getIo } = await import('../socket/socketHandler.js');
    const io = getIo();
    if (io) {
      io.to(roomId).emit('report-ready', { roomId });
    }
  } catch (err) {
    console.error("Gemini feedback generation error:", err);
    try {
      const room = await Room.findOne({ roomId });
      if (room) {
        room.feedbackReport = { error: true, message: "Report generation failed. Please review the session manually." };
        await room.save();
        const { getIo } = await import('../socket/socketHandler.js');
        const io = getIo();
        if (io) io.to(roomId).emit('report-ready', { roomId });
      }
    } catch (saveErr) {
      console.error("Failed to save error report:", saveErr);
    }
  }
};

export const ensureProblemDescriptions = async (problems) => {
  if (!problems) return;
  const problemsArray = Array.isArray(problems) ? problems : [problems];

  for (const p of problemsArray) {
    if (!p) continue;
    // Check if the description contains the placeholder text
    if (p.description && p.description.includes('imported from GeeksforGeeks')) {
      try {
        console.log(`[GFG Import] Generating description for: "${p.title}"`);
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
          console.warn("GEMINI_API_KEY not found in env, skipping description generation.");
          continue;
        }

        const prompt = `You are a computer science instructor and technical interviewer.
Generate a clean, professional, and detailed coding problem description in markdown format for the standard coding interview problem: "${p.title}".
This is a GeeksforGeeks problem of difficulty "${p.difficulty}" and topic "${p.topic}".

Your response should contain:
- A clear, concise problem statement explaining what needs to be solved.
- At least two Examples with Input, Output, and Explanation.
- Expected Time and Space Complexity.
- Constraints.

Ensure the markdown is clean. Do not wrap the response in \`\`\`markdown or \`\`\`, just output the raw markdown text directly.`;

        const apiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey
          },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }]
          })
        });

        if (apiResponse.ok) {
          const data = await apiResponse.json();
          let description = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
          description = description.trim();

          // Clean up ```markdown wrappers if the model still generated them
          if (description.startsWith("```markdown")) {
            description = description.slice(11);
          } else if (description.startsWith("```")) {
            description = description.slice(3);
          }
          if (description.endsWith("```")) {
            description = description.slice(0, -3);
          }
          description = description.trim();

          if (description) {
            // Update in MongoDB
            p.description = description;
            await p.save();
            console.log(`[GFG Import] Successfully generated and saved description for: "${p.title}"`);
          }
        } else {
          console.error(`[GFG Import] Gemini API error: Status ${apiResponse.status}`);
        }
      } catch (err) {
        console.error(`[GFG Import] Error generating description for "${p.title}":`, err);
      }
    }
  }
};

