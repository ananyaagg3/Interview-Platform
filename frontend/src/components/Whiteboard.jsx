import React, { useState, useEffect, useRef } from 'react';
import { Square, Circle, Minus, Type, Trash2, Edit2, Eraser } from 'lucide-react';

export default function Whiteboard({ roomId, socket, canvasRef }) {
  const [tool, setTool] = useState('pen'); // 'pen' | 'eraser' | 'rectangle' | 'circle' | 'line' | 'text'
  const [color, setColor] = useState('#000000');
  const [strokeWidth, setStrokeWidth] = useState(5); // 2 = thin, 5 = medium, 10 = thick
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const [textInput, setTextInput] = useState(null); // { x, y }
  const [textValue, setTextValue] = useState('');
  const textInputRef = useRef(null);

  const containerRef = useRef(null);
  const previewCanvasRef = useRef(null);
  const whiteboardHistory = useRef([]);

  const isDrawing = useRef(false);
  const startPoint = useRef({ x: 0, y: 0 });
  const currentPathPoints = useRef([]);
  const lastEmitTime = useRef(0);

  // Draw event on canvas context helper
  const drawEventOnCanvas = (ctx, event) => {
    if (!ctx) return;

    if (event.tool === 'pen' || event.tool === 'eraser') {
      if (!event.points || event.points.length < 1) return;
      ctx.strokeStyle = event.tool === 'eraser' ? '#ffffff' : event.color;
      ctx.lineWidth = event.strokeWidth;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(event.points[0].x, event.points[0].y);
      for (let i = 1; i < event.points.length; i++) {
        ctx.lineTo(event.points[i].x, event.points[i].y);
      }
      ctx.stroke();
    } else if (event.tool === 'rectangle') {
      if (!event.points || event.points.length < 2) return;
      ctx.strokeStyle = event.color;
      ctx.lineWidth = event.strokeWidth;
      ctx.lineCap = 'square';
      ctx.lineJoin = 'miter';
      const [start, end] = event.points;
      ctx.strokeRect(start.x, start.y, end.x - start.x, end.y - start.y);
    } else if (event.tool === 'circle') {
      if (!event.points || event.points.length < 2) return;
      ctx.strokeStyle = event.color;
      ctx.lineWidth = event.strokeWidth;
      const [start, end] = event.points;
      const rx = Math.abs(end.x - start.x) / 2;
      const ry = Math.abs(end.y - start.y) / 2;
      const cx = start.x + (end.x - start.x) / 2;
      const cy = start.y + (end.y - start.y) / 2;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, 2 * Math.PI);
      ctx.stroke();
    } else if (event.tool === 'line') {
      if (!event.points || event.points.length < 2) return;
      ctx.strokeStyle = event.color;
      ctx.lineWidth = event.strokeWidth;
      ctx.lineCap = 'round';
      const [start, end] = event.points;
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();
    } else if (event.tool === 'text') {
      if (!event.points || event.points.length < 1) return;
      ctx.fillStyle = event.color;
      const size = event.strokeWidth === 2 ? 14 : event.strokeWidth === 5 ? 18 : 24;
      ctx.font = `${size}px Inter, sans-serif`;
      ctx.textBaseline = 'top';
      const pos = event.points[0];
      ctx.fillText(event.text, pos.x, pos.y);
    }
  };

  const redrawCanvas = (canvas, ctx, events) => {
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // Draw white background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // Replay history
    events.forEach((event) => {
      drawEventOnCanvas(ctx, event);
    });
  };

  // Resize canvas responsively
  const handleResize = () => {
    if (!containerRef.current || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const previewCanvas = previewCanvasRef.current;
    const container = containerRef.current;

    const width = container.clientWidth;
    const height = container.clientHeight;

    canvas.width = width;
    canvas.height = height;
    if (previewCanvas) {
      previewCanvas.width = width;
      previewCanvas.height = height;
    }

    redrawCanvas(canvas, canvas.getContext('2d'), whiteboardHistory.current);
  };

  // Setup canvas size & resize observer
  useEffect(() => {
    handleResize();
    const resizeObserver = new ResizeObserver(() => {
      handleResize();
    });
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }
    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  // Listen to Socket events
  useEffect(() => {
    if (!socket) return;

    const onWhiteboardDraw = (event) => {
      whiteboardHistory.current.push(event);
      const canvas = canvasRef.current;
      if (canvas) {
        drawEventOnCanvas(canvas.getContext('2d'), event);
      }
    };

    const onWhiteboardClear = () => {
      whiteboardHistory.current = [];
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
    };

    const onWhiteboardHistory = (history) => {
      whiteboardHistory.current = history;
      const canvas = canvasRef.current;
      if (canvas) {
        redrawCanvas(canvas, canvas.getContext('2d'), history);
      }
    };

    socket.on('whiteboard-draw', onWhiteboardDraw);
    socket.on('whiteboard-clear', onWhiteboardClear);
    socket.on('whiteboard-history', onWhiteboardHistory);

    return () => {
      socket.off('whiteboard-draw', onWhiteboardDraw);
      socket.off('whiteboard-clear', onWhiteboardClear);
      socket.off('whiteboard-history', onWhiteboardHistory);
    };
  }, [socket, canvasRef]);

  // Drawing event handlers
  const getCoordinates = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  };

  const handleMouseDown = (e) => {
    if (textInput) return; // Wait for text input to finish
    const { x, y } = getCoordinates(e);

    if (tool === 'text') {
      setTextInput({ x, y });
      setTextValue('');
      setTimeout(() => textInputRef.current?.focus(), 50);
      return;
    }

    isDrawing.current = true;
    startPoint.current = { x, y };

    if (tool === 'pen' || tool === 'eraser') {
      currentPathPoints.current = [{ x, y }];
      lastEmitTime.current = Date.now();

      // Draw starting point locally
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        ctx.strokeStyle = tool === 'eraser' ? '#ffffff' : color;
        ctx.lineWidth = strokeWidth;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y);
        ctx.stroke();
      }
    }
  };

  const handleMouseMove = (e) => {
    if (!isDrawing.current) return;
    const { x, y } = getCoordinates(e);

    const canvas = canvasRef.current;
    const previewCanvas = previewCanvasRef.current;
    if (!canvas) return;

    if (tool === 'pen' || tool === 'eraser') {
      // Draw locally immediately
      const ctx = canvas.getContext('2d');
      ctx.strokeStyle = tool === 'eraser' ? '#ffffff' : color;
      ctx.lineWidth = strokeWidth;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      // Draw from last point in current path to active mouse position
      const lastPt = currentPathPoints.current[currentPathPoints.current.length - 1];
      ctx.moveTo(lastPt.x, lastPt.y);
      ctx.lineTo(x, y);
      ctx.stroke();

      currentPathPoints.current.push({ x, y });

      // Throttle socket emission (16ms = ~60fps)
      const now = Date.now();
      if (now - lastEmitTime.current >= 16) {
        const drawEvent = {
          eventType: 'draw',
          tool,
          points: [...currentPathPoints.current],
          color,
          strokeWidth,
          timestamp: now
        };
        socket.emit('whiteboard-draw', { roomId, event: drawEvent });
        whiteboardHistory.current.push(drawEvent);

        // Keep only the last point to serve as the start point of the next segment
        currentPathPoints.current = [{ x, y }];
        lastEmitTime.current = now;
      }
    } else if (previewCanvas) {
      // Shape drawing preview on preview canvas
      const pCtx = previewCanvas.getContext('2d');
      pCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
      pCtx.strokeStyle = color;
      pCtx.lineWidth = strokeWidth;

      if (tool === 'rectangle') {
        pCtx.strokeRect(startPoint.current.x, startPoint.current.y, x - startPoint.current.x, y - startPoint.current.y);
      } else if (tool === 'circle') {
        const rx = Math.abs(x - startPoint.current.x) / 2;
        const ry = Math.abs(y - startPoint.current.y) / 2;
        const cx = startPoint.current.x + (x - startPoint.current.x) / 2;
        const cy = startPoint.current.y + (y - startPoint.current.y) / 2;
        pCtx.beginPath();
        pCtx.ellipse(cx, cy, rx, ry, 0, 0, 2 * Math.PI);
        pCtx.stroke();
      } else if (tool === 'line') {
        pCtx.beginPath();
        pCtx.moveTo(startPoint.current.x, startPoint.current.y);
        pCtx.lineTo(x, y);
        pCtx.stroke();
      }
    }
  };

  const handleMouseUp = (e) => {
    if (!isDrawing.current) return;
    isDrawing.current = false;
    const { x, y } = getCoordinates(e);

    const canvas = canvasRef.current;
    const previewCanvas = previewCanvasRef.current;
    if (!canvas) return;

    if (tool === 'pen' || tool === 'eraser') {
      currentPathPoints.current.push({ x, y });
      
      // Emit remaining points
      if (currentPathPoints.current.length > 1) {
        const drawEvent = {
          eventType: 'draw',
          tool,
          points: [...currentPathPoints.current],
          color,
          strokeWidth,
          timestamp: Date.now()
        };
        socket.emit('whiteboard-draw', { roomId, event: drawEvent });
        whiteboardHistory.current.push(drawEvent);
      }
      currentPathPoints.current = [];
    } else {
      // Commit shape/line to main canvas
      if (previewCanvas) {
        const pCtx = previewCanvas.getContext('2d');
        pCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
      }

      const drawEvent = {
        eventType: 'shape',
        tool,
        points: [startPoint.current, { x, y }],
        color,
        strokeWidth,
        timestamp: Date.now()
      };

      drawEventOnCanvas(canvas.getContext('2d'), drawEvent);
      socket.emit('whiteboard-draw', { roomId, event: drawEvent });
      whiteboardHistory.current.push(drawEvent);
    }
  };

  const handleTextSubmit = () => {
    if (!textInput || !textValue.trim()) {
      setTextInput(null);
      return;
    }

    const { x, y } = textInput;
    const canvas = canvasRef.current;
    if (canvas) {
      const drawEvent = {
        eventType: 'text',
        tool: 'text',
        points: [{ x, y }],
        color,
        strokeWidth,
        text: textValue,
        timestamp: Date.now()
      };

      drawEventOnCanvas(canvas.getContext('2d'), drawEvent);
      socket.emit('whiteboard-draw', { roomId, event: drawEvent });
      whiteboardHistory.current.push(drawEvent);
    }

    setTextInput(null);
    setTextValue('');
  };

  const handleClearCanvas = () => {
    setShowClearConfirm(true);
  };

  const confirmClearCanvas = () => {
    socket.emit('whiteboard-clear', { roomId });
    setShowClearConfirm(false);
  };

  return (
    <div className="flex flex-col h-full bg-white select-none">
      {/* Toolbar */}
      <div className="h-12 border-b border-gray-200 bg-gray-50 flex items-center justify-between px-4">
        <div className="flex items-center gap-1.5">
          {/* Pen */}
          <button
            onClick={() => setTool('pen')}
            className={`p-1.5 rounded transition ${tool === 'pen' ? 'bg-orange-100 text-orange-600 border border-orange-300' : 'text-gray-600 hover:bg-gray-100'}`}
            title="Pen Tool"
          >
            <Edit2 size={16} />
          </button>
          
          {/* Eraser */}
          <button
            onClick={() => setTool('eraser')}
            className={`p-1.5 rounded transition ${tool === 'eraser' ? 'bg-orange-100 text-orange-600 border border-orange-300' : 'text-gray-600 hover:bg-gray-100'}`}
            title="Eraser Tool"
          >
            <Eraser size={16} />
          </button>

          <div className="h-4 w-px bg-gray-200 mx-1" />

          {/* Rectangle */}
          <button
            onClick={() => setTool('rectangle')}
            className={`p-1.5 rounded transition ${tool === 'rectangle' ? 'bg-orange-100 text-orange-600 border border-orange-300' : 'text-gray-600 hover:bg-gray-100'}`}
            title="Rectangle"
          >
            <Square size={16} />
          </button>

          {/* Circle */}
          <button
            onClick={() => setTool('circle')}
            className={`p-1.5 rounded transition ${tool === 'circle' ? 'bg-orange-100 text-orange-600 border border-orange-300' : 'text-gray-600 hover:bg-gray-100'}`}
            title="Circle"
          >
            <Circle size={16} />
          </button>

          {/* Line */}
          <button
            onClick={() => setTool('line')}
            className={`p-1.5 rounded transition ${tool === 'line' ? 'bg-orange-100 text-orange-600 border border-orange-300' : 'text-gray-600 hover:bg-gray-100'}`}
            title="Straight Line"
          >
            <Minus size={16} />
          </button>

          {/* Text */}
          <button
            onClick={() => setTool('text')}
            className={`p-1.5 rounded transition ${tool === 'text' ? 'bg-orange-100 text-orange-600 border border-orange-300' : 'text-gray-600 hover:bg-gray-100'}`}
            title="Text Tool"
          >
            <Type size={16} />
          </button>
        </div>

        <div className="flex items-center gap-3">
          {/* Stroke width selector */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => setStrokeWidth(2)}
              className={`text-[10px] font-bold px-2 py-1 rounded border ${strokeWidth === 2 ? 'bg-orange-100 text-orange-600 border-orange-300' : 'bg-white text-gray-600 border-gray-200'}`}
            >
              Thin
            </button>
            <button
              onClick={() => setStrokeWidth(5)}
              className={`text-[10px] font-bold px-2 py-1 rounded border ${strokeWidth === 5 ? 'bg-orange-100 text-orange-600 border-orange-300' : 'bg-white text-gray-600 border-gray-200'}`}
            >
              Med
            </button>
            <button
              onClick={() => setStrokeWidth(10)}
              className={`text-[10px] font-bold px-2 py-1 rounded border ${strokeWidth === 10 ? 'bg-orange-100 text-orange-600 border-orange-300' : 'bg-white text-gray-600 border-gray-200'}`}
            >
              Thick
            </button>
          </div>

          <div className="h-4 w-px bg-gray-200" />

          {/* Color Picker */}
          <label htmlFor="wb-color-picker" className="flex items-center gap-1.5 relative cursor-pointer">
            <span
              className="w-5 h-5 rounded-full border-2 border-gray-300 shrink-0"
              style={{ backgroundColor: color }}
            />
            <input
              id="wb-color-picker"
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="sr-only"
            />
            <span className="text-xs font-semibold text-gray-500">{color}</span>
          </label>

          <div className="h-4 w-px bg-gray-200" />

          {/* Clear canvas */}
          <button
            onClick={handleClearCanvas}
            className="text-red-500 hover:bg-red-50 hover:text-red-600 p-1.5 rounded transition flex items-center gap-1 text-xs font-bold"
            title="Clear Board for Everyone"
          >
            <Trash2 size={14} /> Clear Board
          </button>
        </div>
      </div>

      {/* Canvas container */}
      <div
        ref={containerRef}
        className="flex-1 bg-white relative overflow-hidden cursor-crosshair"
      >
        {/* Main Canvas (bottom) */}
        <canvas
          ref={canvasRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          className="absolute inset-0 z-10"
        />

        {/* Preview Canvas (top, pointer-events none) */}
        <canvas
          ref={previewCanvasRef}
          className="absolute inset-0 z-20 pointer-events-none"
        />

        {/* Floating text input */}
        {textInput && (
          <div
            className="absolute z-30"
            style={{ left: `${textInput.x}px`, top: `${textInput.y}px` }}
          >
            <input
              ref={textInputRef}
              type="text"
              value={textValue}
              onChange={(e) => setTextValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleTextSubmit();
                if (e.key === 'Escape') setTextInput(null);
              }}
              onBlur={handleTextSubmit}
              placeholder="Type & press Enter..."
              className="bg-white border-2 border-orange-500 rounded px-2 py-1 text-sm outline-none shadow-md font-sans text-gray-800"
              style={{
                color: color,
                fontSize: `${strokeWidth === 2 ? 14 : strokeWidth === 5 ? 18 : 24}px`
              }}
            />
          </div>
        )}
      </div>

      {/* Clear Whiteboard Custom Modal */}
      {showClearConfirm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center z-[999] p-4 transition-all duration-200">
          <div className="bg-white rounded-2xl shadow-xl border border-gray-100 max-w-sm w-full overflow-hidden transform transition-all scale-100 animate-in fade-in zoom-in-95 duration-200">
            {/* Top accent line */}
            <div className="h-1.5 w-full bg-gradient-to-r from-orange-500 to-red-500" />
            <div className="p-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-full bg-red-50 text-red-500 flex items-center justify-center border border-red-100 shrink-0">
                  <Trash2 size={18} />
                </div>
                <h3 className="text-base font-bold text-gray-900">Clear Whiteboard?</h3>
              </div>
              <p className="text-xs text-gray-500 leading-relaxed mb-5">
                Are you sure you want to clear the whiteboard for everyone? This will permanently delete all active drawings on the canvas.
              </p>
              <div className="flex justify-end gap-2.5">
                <button 
                  onClick={() => setShowClearConfirm(false)}
                  className="px-3.5 py-1.5 border border-gray-300 hover:bg-gray-50 active:bg-gray-100 text-gray-600 font-semibold text-xs rounded-xl transition duration-150 cursor-pointer"
                >
                  Cancel
                </button>
                <button 
                  onClick={confirmClearCanvas}
                  className="px-3.5 py-1.5 bg-red-500 hover:bg-red-600 active:bg-red-700 text-white font-semibold text-xs rounded-xl transition duration-150 shadow-sm cursor-pointer"
                >
                  Yes, Clear Board
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
