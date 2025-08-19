import React, { useEffect, useCallback, useState, useRef } from "react";
import { Video, VideoOff, Phone, PhoneCall, Users, Wifi, WifiOff, Mic, MicOff } from "lucide-react";
import peer from "../service/peer";
import { useSocket } from "../context/SocketProvider";

const RoomPage = () => {
  const socket = useSocket();
  const [remoteSocketId, setRemoteSocketId] = useState(null);
  const [myStream, setMyStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [isVideoMuted, setIsVideoMuted] = useState(false);
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [callStatus, setCallStatus] = useState('disconnected');
  
  // Use refs to track event listeners
  const trackHandlerRef = useRef(null);
  const negotiationHandlerRef = useRef(null);

  // Reset the peer connection completely
  const resetPeerConnection = useCallback(() => {
    try {
      // Remove existing event listeners
      if (peer.peer && trackHandlerRef.current) {
        peer.peer.removeEventListener("track", trackHandlerRef.current);
      }
      
      if (peer.peer && negotiationHandlerRef.current) {
        peer.peer.removeEventListener("negotiationneeded", negotiationHandlerRef.current);
      }
      
      // Close the existing peer connection
      if (peer.peer) {
        peer.peer.close();
      }
      
      // Create a new peer connection
      peer.createPeer();
      
      // Set up new event listeners
      trackHandlerRef.current = async (ev) => {
        const remoteStreams = ev.streams;
        if (remoteStreams && remoteStreams.length > 0) {
          console.log("GOT TRACKS!!");
          setRemoteStream(remoteStreams[0]);
        }
      };
      
      negotiationHandlerRef.current = () => handleNegoNeeded();
      
      if (peer.peer) {
        peer.peer.addEventListener("track", trackHandlerRef.current);
        peer.peer.addEventListener("negotiationneeded", negotiationHandlerRef.current);
      }
      
      console.log("Peer connection reset successfully");
    } catch (error) {
      console.error("Error resetting peer connection:", error);
    }
  }, []);

  const handleUserJoined = useCallback(({ email, id }) => {
    console.log(`Email ${email} joined room`);
    setRemoteSocketId(id);
  }, []);

  const handleCallUser = useCallback(async () => {
    try {
      // Reset the peer connection before starting a new call
      resetPeerConnection();
      
      setCallStatus('connecting');
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: true,
      });
      setMyStream(stream);
      
      // Get offer after ensuring the peer connection is in stable state
      setTimeout(async () => {
        try {
          const offer = await peer.getOffer();
          socket.emit("user:call", { to: remoteSocketId, offer });
        } catch (error) {
          console.error("Error creating offer:", error);
          setCallStatus('disconnected');
        }
      }, 100);
    } catch (error) {
      console.error("Error accessing media devices:", error);
      setCallStatus('disconnected');
    }
  }, [remoteSocketId, socket, resetPeerConnection]);

  const handleIncommingCall = useCallback(
    async ({ from, offer }) => {
      setRemoteSocketId(from);
      try {
        // Reset the peer connection before handling incoming call
        resetPeerConnection();
        
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: true,
        });
        setMyStream(stream);
        console.log(`Incoming Call`, from, offer);
        
        // Get answer after ensuring the peer connection is in stable state
        setTimeout(async () => {
          try {
            const answer = await peer.getAnswer(offer);
            socket.emit("call:accepted", { to: from, answer });
            setCallStatus('connected');
          } catch (error) {
            console.error("Error creating answer:", error);
          }
        }, 100);
      } catch (error) {
        console.error("Error accessing media devices:", error);
      }
    },
    [socket, resetPeerConnection]
  );

  const sendStreams = useCallback(() => {
    if (myStream && peer.peer) {
      try {
        // Remove any existing tracks first
        const senders = peer.peer.getSenders();
        senders.forEach(sender => peer.peer.removeTrack(sender));
        
        // Add all tracks from the stream
        for (const track of myStream.getTracks()) {
          peer.peer.addTrack(track, myStream);
        }
        console.log("Streams sent successfully");
      } catch (error) {
        console.error("Error sending streams:", error);
      }
    }
  }, [myStream]);

  const handleCallAccepted = useCallback(
    async ({ from, answer }) => {
      try {
        await peer.setLocalDescription(answer);
        console.log("Call Accepted!");
        sendStreams();
        setCallStatus('connected');
      } catch (error) {
        console.error("Error setting local description:", error);
      }
    },
    [sendStreams]
  );

  const handleNegoNeeded = useCallback(async () => {
    try {
      const offer = await peer.getOffer();
      socket.emit("peer:nego:needed", { offer, to: remoteSocketId });
    } catch (error) {
      console.error("Error during negotiation:", error);
    }
  }, [remoteSocketId, socket]);

  const handleNegoNeedIncomming = useCallback(
    async ({ from, offer }) => {
      try {
        const answer = await peer.getAnswer(offer);
        socket.emit("peer:nego:done", { to: from, answer });
      } catch (error) {
        console.error("Error handling incoming negotiation:", error);
      }
    },
    [socket]
  );

  const handleNegoNeedFinal = useCallback(async ({ answer }) => {
    try {
      await peer.setLocalDescription(answer);
    } catch (error) {
      console.error("Error setting final negotiation:", error);
    }
  }, []);

  const toggleVideo = () => {
    if (myStream) {
      const videoTrack = myStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoMuted(!videoTrack.enabled);
      }
    }
  };

  const toggleAudio = () => {
    if (myStream) {
      const audioTrack = myStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsAudioMuted(!audioTrack.enabled);
      }
    }
  };

  const handleEndCall = useCallback(() => {
    // Close all media tracks
    if (myStream) {
      myStream.getTracks().forEach(track => track.stop());
    }
    
    // Notify the other user that the call has ended
    if (remoteSocketId) {
      socket.emit("call:ended", { to: remoteSocketId });
    }
    
    // Reset states but keep remoteSocketId for reconnection
    setMyStream(null);
    setRemoteStream(null);
    setCallStatus('disconnected');
    setIsVideoMuted(false);
    setIsAudioMuted(false);
    
    console.log("Call ended");
  }, [myStream, remoteSocketId, socket]);

  const handleCallEnded = useCallback(() => {
    // Close all media tracks
    if (myStream) {
      myStream.getTracks().forEach(track => track.stop());
    }
    
    // Reset states
    setMyStream(null);
    setRemoteStream(null);
    setCallStatus('disconnected');
    setIsVideoMuted(false);
    setIsAudioMuted(false);
    
    console.log("Remote user ended the call");
  }, [myStream]);

  useEffect(() => {
    // Set up event listeners when component mounts
    if (peer.peer) {
      trackHandlerRef.current = async (ev) => {
        const remoteStreams = ev.streams;
        if (remoteStreams && remoteStreams.length > 0) {
          console.log("GOT TRACKS!!");
          setRemoteStream(remoteStreams[0]);
        }
      };
      
      negotiationHandlerRef.current = () => handleNegoNeeded();
      
      peer.peer.addEventListener("track", trackHandlerRef.current);
      peer.peer.addEventListener("negotiationneeded", negotiationHandlerRef.current);
    }
    
    return () => {
      // Clean up event listeners when component unmounts
      if (peer.peer && trackHandlerRef.current) {
        peer.peer.removeEventListener("track", trackHandlerRef.current);
      }
      
      if (peer.peer && negotiationHandlerRef.current) {
        peer.peer.removeEventListener("negotiationneeded", negotiationHandlerRef.current);
      }
    };
  }, [handleNegoNeeded]);

  useEffect(() => {
    socket.on("user:joined", handleUserJoined);
    socket.on("incomming:call", handleIncommingCall);
    socket.on("call:accepted", handleCallAccepted);
    socket.on("peer:nego:needed", handleNegoNeedIncomming);
    socket.on("peer:nego:final", handleNegoNeedFinal);
    socket.on("call:ended", handleCallEnded);

    return () => {
      socket.off("user:joined", handleUserJoined);
      socket.off("incomming:call", handleIncommingCall);
      socket.off("call:accepted", handleCallAccepted);
      socket.off("peer:nego:needed", handleNegoNeedIncomming);
      socket.off("peer:nego:final", handleNegoNeedFinal);
      socket.off("call:ended", handleCallEnded);
    };
  }, [
    socket,
    handleUserJoined,
    handleIncommingCall,
    handleCallAccepted,
    handleNegoNeedIncomming,
    handleNegoNeedFinal,
    handleCallEnded
  ]);

  const styles = {
    container: {
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)',
      color: 'white',
      fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
      overflow: 'hidden',
      position: 'relative'
    },
    header: {
      position: 'relative',
      zIndex: 10,
      padding: '24px 24px 16px'
    },
    headerTop: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: '24px'
    },
    logoSection: {
      display: 'flex',
      alignItems: 'center',
      gap: '12px'
    },
    logoIcon: {
      width: '42px',
      height: '42px',
      borderRadius: '12px',
      background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      boxShadow: '0 4px 6px rgba(99, 102, 241, 0.3)'
    },
    title: {
      fontSize: '24px',
      fontWeight: '700',
      background: 'linear-gradient(45deg, #ffffff, #e0e7ff)',
      WebkitBackgroundClip: 'text',
      WebkitTextFillColor: 'transparent',
      backgroundClip: 'text',
      letterSpacing: '-0.025em'
    },
    statusBadge: {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      padding: '8px 16px',
      borderRadius: '12px',
      background: 'rgba(30, 41, 59, 0.7)',
      backdropFilter: 'blur(10px)',
      border: '1px solid rgba(255, 255, 255, 0.1)',
      boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
    },
    statusText: {
      fontSize: '14px',
      fontWeight: '500'
    },
    statusDot: {
      width: '8px',
      height: '8px',
      borderRadius: '50%',
      animation: 'pulse 2s infinite'
    },
    callButtonContainer: {
      display: 'flex',
      justifyContent: 'center',
      marginBottom: '24px'
    },
    callButton: {
      position: 'relative',
      padding: '16px 32px',
      background: 'linear-gradient(135deg, #10b981, #3b82f6)',
      borderRadius: '16px',
      border: 'none',
      fontWeight: '600',
      color: 'white',
      boxShadow: '0 10px 25px -5px rgba(16, 185, 129, 0.4)',
      cursor: 'pointer',
      transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      fontSize: '16px',
      overflow: 'hidden'
    },
    callButtonHover: {
      transform: 'translateY(-2px)',
      boxShadow: '0 20px 25px -5px rgba(16, 185, 129, 0.4), 0 10px 10px -5px rgba(16, 185, 129, 0.2)'
    },
    videoGrid: {
      padding: '0 24px 24px',
      maxWidth: '1280px',
      margin: '0 auto'
    },
    gridContainer: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))',
      gap: '24px'
    },
    videoContainer: {
      position: 'relative',
      borderRadius: '20px',
      overflow: 'hidden',
      background: 'linear-gradient(135deg, #1e293b, #0f172a)',
      boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
      border: '1px solid rgba(255, 255, 255, 0.06)',
      transition: 'all 0.3s ease',
      transform: 'translateZ(0)'
    },
    video: {
      width: '100%',
      aspectRatio: '16/9',
      objectFit: 'cover',
      display: 'block'
    },
    videoOverlay: {
      position: 'absolute',
      inset: 0,
      background: 'linear-gradient(to top, rgba(0, 0, 0, 0.6) 0%, transparent 60%)',
      pointerEvents: 'none'
    },
    videoLabel: {
      position: 'absolute',
      bottom: '16px',
      left: '16px',
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      padding: '8px 16px',
      borderRadius: '12px',
      background: 'rgba(0, 0, 0, 0.5)',
      backdropFilter: 'blur(10px)',
      border: '1px solid rgba(255, 255, 255, 0.1)'
    },
    labelDot: {
      width: '8px',
      height: '8px',
      borderRadius: '50%'
    },
    labelText: {
      fontSize: '14px',
      fontWeight: '500'
    },
    emptyState: {
      gridColumn: '1 / -1',
      borderRadius: '20px',
      background: 'rgba(30, 41, 59, 0.5)',
      backdropFilter: 'blur(16px)',
      border: '1px solid rgba(255, 255, 255, 0.06)',
      boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
      overflow: 'hidden'
    },
    emptyContent: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '80px 24px',
      textAlign: 'center'
    },
    emptyIcon: {
      width: '80px',
      height: '80px',
      borderRadius: '24px',
      background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: '24px',
      boxShadow: '0 10px 15px -3px rgba(99, 102, 241, 0.3)'
    },
    emptyTitle: {
      fontSize: '24px',
      fontWeight: '700',
      marginBottom: '12px',
      background: 'linear-gradient(45deg, #ffffff, #e0e7ff)',
      WebkitBackgroundClip: 'text',
      WebkitTextFillColor: 'transparent',
      backgroundClip: 'text'
    },
    emptyDescription: {
      color: '#94a3b8',
      maxWidth: '400px',
      lineHeight: '1.6',
      fontSize: '16px'
    },
    floatingControls: {
      position: 'fixed',
      bottom: '32px',
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 20,
      display: 'flex',
      alignItems: 'center',
      gap: '16px',
      padding: '16px',
      borderRadius: '20px',
      background: 'rgba(15, 23, 42, 0.8)',
      backdropFilter: 'blur(16px)',
      border: '1px solid rgba(255, 255, 255, 0.1)',
      boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
      transition: 'all 0.3s ease'
    },
    controlButton: {
      width: '56px',
      height: '56px',
      borderRadius: '16px',
      border: 'none',
      cursor: 'pointer',
      transition: 'all 0.2s ease',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
    },
    endCallButton: {
      background: '#ef4444',
      boxShadow: '0 4px 6px rgba(239, 68, 68, 0.3)'
    },
    muteButton: {
      background: isVideoMuted ? '#ef4444' : 'rgba(255, 255, 255, 0.1)',
      color: 'white'
    },
    audioButton: {
      background: isAudioMuted ? '#ef4444' : 'rgba(255, 255, 255, 0.1)',
      color: 'white'
    },
    controlButtonHover: {
      transform: 'scale(1.1)',
      boxShadow: '0 6px 10px rgba(0, 0, 0, 0.2)'
    },
    ambientDecor1: {
      position: 'fixed',
      top: '10%',
      left: '10%',
      width: '512px',
      height: '512px',
      background: 'radial-gradient(circle, rgba(99, 102, 241, 0.15) 0%, transparent 70%)',
      borderRadius: '50%',
      filter: 'blur(64px)',
      pointerEvents: 'none',
      animation: 'float 12s ease-in-out infinite'
    },
    ambientDecor2: {
      position: 'fixed',
      bottom: '10%',
      right: '10%',
      width: '512px',
      height: '512px',
      background: 'radial-gradient(circle, rgba(139, 92, 246, 0.15) 0%, transparent 70%)',
      borderRadius: '50%',
      filter: 'blur(64px)',
      pointerEvents: 'none',
      animation: 'float 10s ease-in-out infinite reverse'
    },
    connectionStatus: {
      position: 'fixed',
      top: '24px',
      right: '24px',
      zIndex: 30,
      padding: '8px 16px',
      borderRadius: '12px',
      background: 'rgba(30, 41, 59, 0.8)',
      backdropFilter: 'blur(10px)',
      border: '1px solid rgba(255, 255, 255, 0.1)',
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      fontSize: '14px',
      fontWeight: '500'
    },
    callStatusIndicator: {
      position: 'fixed',
      top: '70px',
      right: '24px',
      zIndex: 30,
      padding: '6px 12px',
      borderRadius: '8px',
      background: callStatus === 'connected' ? 'rgba(16, 185, 129, 0.2)' : 
                 callStatus === 'connecting' ? 'rgba(245, 158, 11, 0.2)' : 
                 'rgba(100, 116, 139, 0.2)',
      backdropFilter: 'blur(10px)',
      border: `1px solid ${callStatus === 'connected' ? 'rgba(16, 185, 129, 0.3)' : 
                         callStatus === 'connecting' ? 'rgba(245, 158, 11, 0.3)' : 
                         'rgba(100, 116, 139, 0.3)'}`,
      display: 'flex',
      alignItems: 'center',
      gap: '6px',
      fontSize: '12px',
      fontWeight: '500',
      color: callStatus === 'connected' ? '#10b981' : 
             callStatus === 'connecting' ? '#f59e0b' : 
             '#64748b'
    }
  };

  // Add CSS animation
  if (!document.querySelector('#room-animations')) {
    const style = document.createElement('style');
    style.id = 'room-animations';
    style.textContent = `
      @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.7; }
      }
      @keyframes float {
        0%, 100% { transform: translateY(0) scale(1); }
        50% { transform: translateY(-20px) scale(1.05); }
      }
      .call-button {
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      }
      .call-button:hover {
        transform: translateY(-2px);
        box-shadow: 0 20px 25px -5px rgba(16, 185, 129, 0.4), 0 10px 10px -5px rgba(16, 185, 129, 0.2);
      }
      .control-button {
        transition: all 0.2s ease;
      }
      .control-button:hover {
        transform: scale(1.1);
        box-shadow: 0 6px 10px rgba(0, 0, 0, 0.2);
      }
      .video-container {
        transition: all 0.3s ease;
      }
      .video-container:hover {
        transform: translateY(-4px);
        boxShadow: 0 35px 60px -12px rgba(0, 0, 0, 0.3);
      }
    `;
    document.head.appendChild(style);
  }

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerTop}>
          <div style={styles.logoSection}>
            <div style={styles.logoIcon}>
              <Video size={20} />
            </div>
            <h1 style={styles.title}>Video Room</h1>
          </div>
        </div>

        {/* Connection Status */}
        <div style={styles.connectionStatus}>
          {remoteSocketId ? (
            <>
              <Wifi size={16} color="#10b981" />
              <span style={{color: '#10b981'}}>Connected</span>
            </>
          ) : (
            <>
              <WifiOff size={16} color="#f59e0b" />
              <span style={{color: '#f59e0b'}}>Waiting for participants</span>
            </>
          )}
        </div>

        {/* Call Status Indicator */}
        {(callStatus === 'connected' || callStatus === 'connecting') && (
          <div style={styles.callStatusIndicator}>
            <div style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              backgroundColor: callStatus === 'connected' ? '#10b981' : '#f59e0b',
              animation: 'pulse 2s infinite'
            }}></div>
            <span>
              {callStatus === 'connected' ? 'Call in progress' : 'Connecting...'}
            </span>
          </div>
        )}

        {/* Call Button */}
        {remoteSocketId && !myStream && (
          <div style={styles.callButtonContainer}>
            <button 
              onClick={handleCallUser}
              style={styles.callButton}
              className="call-button"
            >
              <PhoneCall size={20} />
              <span>Start Call</span>
            </button>
          </div>
        )}
      </div>

      {/* Video Grid */}
      <div style={styles.videoGrid}>
        <div style={styles.gridContainer}>
          {/* My Stream */}
          {myStream && (
            <div style={styles.videoContainer} className="video-container">
              <video
                autoPlay
                muted
                playsInline
                style={styles.video}
                ref={(videoEl) => {
                  if (videoEl) videoEl.srcObject = myStream;
                }}
              />
              <div style={styles.videoOverlay}></div>
              
              {/* Video Label */}
              <div style={styles.videoLabel}>
                <div style={{...styles.labelDot, backgroundColor: '#6366f1'}}></div>
                <span style={styles.labelText}>You {isVideoMuted ? '(Video Off)' : ''} {isAudioMuted ? '(Muted)' : ''}</span>
              </div>
            </div>
          )}

          {/* Remote Stream */}
          {remoteStream && (
            <div style={styles.videoContainer} className="video-container">
              <video
                autoPlay
                playsInline
                style={styles.video}
                ref={(videoEl) => {
                  if (videoEl) videoEl.srcObject = remoteStream;
                }}
              />
              <div style={styles.videoOverlay}></div>
              
              {/* Video Label */}
              <div style={styles.videoLabel}>
                <div style={{...styles.labelDot, backgroundColor: '#10b981'}}></div>
                <span style={styles.labelText}>Remote User</span>
              </div>
            </div>
          )}

          {/* Empty State */}
          {!myStream && !remoteStream && (
            <div style={styles.emptyState}>
              <div style={styles.emptyContent}>
                <div style={styles.emptyIcon}>
                  <Users size={32} />
                </div>
                <h3 style={styles.emptyTitle}>Ready to Connect</h3>
                <p style={styles.emptyDescription}>
                  {remoteSocketId 
                    ? "Click the call button to start your video conversation"
                    : "Waiting for other participants to join the room"
                  }
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Floating Action Controls */}
      {(myStream || remoteStream) && (
        <div style={styles.floatingControls}>
          <button 
            style={{...styles.controlButton, ...styles.audioButton}}
            className="control-button"
            onClick={toggleAudio}
          >
            {isAudioMuted ? <MicOff size={24} /> : <Mic size={24} />}
          </button>
          <button 
            style={{...styles.controlButton, ...styles.muteButton}}
            className="control-button"
            onClick={toggleVideo}
          >
            {isVideoMuted ? <VideoOff size={24} /> : <Video size={24} />}
          </button>
          <button 
            style={{...styles.controlButton, ...styles.endCallButton}}
            className="control-button"
            onClick={handleEndCall}
          >
            <Phone size={24} />
          </button>
        </div>
      )}

      {/* Ambient Decoration */}
      <div style={styles.ambientDecor1}></div>
      <div style={styles.ambientDecor2}></div>
    </div>
  );
};

export default RoomPage;