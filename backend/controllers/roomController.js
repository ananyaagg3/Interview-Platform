import { nanoid } from 'nanoid';
import Room from '../models/Room.js';
import Problem from '../models/Problem.js';

export const createRoom = async (req, res) => {
  try {
    const { problemSource, problemId, customProblem, duration, defaultLanguage } = req.body;
    const createdBy = req.user.id;

    if (problemSource === 'bank' && !problemId) {
      return res.status(400).json({ error: 'Problem ID is required for bank problems' });
    }
    if (problemSource === 'custom' && (!customProblem?.title || !customProblem?.description)) {
      return res.status(400).json({ error: 'Title and description are required for custom problems' });
    }

    const roomId = nanoid(8);
    const room = new Room({
      roomId,
      createdBy,
      interviewerId: createdBy,
      problemSource,
      problemId: problemSource === 'bank' ? problemId : null,
      customProblem: problemSource === 'custom' ? customProblem : null,
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
      .populate('interviewerId')
      .populate('candidateId');
    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
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
      .populate('interviewerId')
      .populate('candidateId')
      .sort({ createdAt: -1 });
    res.status(200).json({ rooms });
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
    res.status(200).json({
      url: process.env.TURN_URL || "",
      username: process.env.TURN_USERNAME || "",
      credential: process.env.TURN_CREDENTIAL || ""
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

export const generateFeedbackReport = async (roomId) => {
  try {
    const room = await Room.findOne({ roomId }).populate('problemId');
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

