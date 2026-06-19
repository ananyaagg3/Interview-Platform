import React from 'react';
import { useNavigate } from 'react-router-dom';

export default function SessionEnded() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white p-8 rounded-lg shadow-sm border border-gray-100 max-w-md w-full text-center">
        <h2 className="text-2xl font-bold text-gray-800 mb-2">Session Ended</h2>
        <p className="text-gray-600 mb-6">The interview session has been concluded.</p>
        <button 
          onClick={() => navigate('/dashboard')}
          className="bg-orange-500 hover:bg-orange-600 text-white font-medium py-2 px-6 rounded transition"
        >
          Back to Dashboard
        </button>
      </div>
    </div>
  );
}
