import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { registerUser } from '../services/api';
import axios from 'axios';
import { config } from '../config/config';
import '../styles/Register.css';

function Register() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [age, setAge] = useState('');
  const [errorMsg, setErrorMsg] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);
  const [loading, setLoading] = useState(false);
  const [isRegistered, setIsRegistered] = useState(false);
  const [confirmationCode, setConfirmationCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      setErrorMsg("Passwords do not match.");
      return;
    }
    setLoading(true);
    setErrorMsg(null);
    try {
      const response = await registerUser({ email, password, firstName, lastName, age: parseInt(age) });
      console.log(response.status);
      if(response.status === "success"){
        setSuccessMsg("Registration successful! We've sent a confirmation email to your address. Please verify your email by clicking the link in the email or entering the confirmation code below.");
        setIsRegistered(true);
      } else {
        setErrorMsg(response.reason);
      }
    } catch (error) {
      const errMsg = error.reason || error.message || 'An error occurred during registration.';
      setErrorMsg(errMsg);
    } finally {
      setLoading(false);
    }
  };
    const handleConfirmationSubmit = (e) => {
    e.preventDefault();
    if (!confirmationCode.trim()) {
      setErrorMsg("Please enter the confirmation code.");
      return;
    }
    
    // Redirect to the confirmation URL with the code
    // window.location.href = `https://focus-flow-236589840712.me-west1.run.app/confirm_email?passcode=${confirmationCode}`;
    window.location.href = `${config.baseURL}/confirm_email?passcode=${confirmationCode}`;
  };
  return (
    <div className="register-container">
      <h2>{isRegistered ? "Verify Email" : "Register"}</h2>
      
      {errorMsg && <p className="error">{errorMsg}</p>}
      {successMsg && <p className="success">{successMsg}</p>}
      {(loading || verifying) && <p className="loading">Please wait...</p>}
      
      {!isRegistered ? (
        // Registration Form
        <form onSubmit={handleSubmit} className="register-form">
          <label>
            First Name:
            <input 
              type="text" 
              value={firstName} 
              onChange={(e)=>setFirstName(e.target.value)} 
              required 
            />
          </label>
          <label>
            Last Name:
            <input 
              type="text" 
              value={lastName} 
              onChange={(e)=>setLastName(e.target.value)} 
              required 
            />
          </label>
          <label>
            Age:
            <input 
              type="number" 
              value={age} 
              onChange={(e)=>setAge(e.target.value)} 
              required 
            />
          </label>
          <label>
            Email:
            <input 
              type="email" 
              value={email} 
              onChange={(e)=>setEmail(e.target.value)} 
              required 
            />
          </label>
          <label>
            Password:
            <input 
              type="password" 
              value={password} 
              onChange={(e)=>setPassword(e.target.value)} 
              required 
            />
          </label>
          <label>
            Confirm Password:
            <input 
              type="password" 
              value={confirmPassword} 
              onChange={(e)=>setConfirmPassword(e.target.value)} 
              required 
            />
          </label>
          <button type="submit" disabled={loading}>Register</button>
        </form>
      ) : (
        // Email Verification Form
        <form onSubmit={handleConfirmationSubmit} className="confirmation-form">          <p className="verification-info">
            Check your email at <strong>{email}</strong> for a confirmation link. 
            You can click the link directly from your email or enter the code below to be redirected to the verification page.
          </p>
          <label>
            Confirmation Code:
            (Check The Spam Folder if you don't see the email)
            <input 
              type="text" 
              value={confirmationCode} 
              onChange={(e)=>setConfirmationCode(e.target.value)} 
              placeholder="Enter code from email"
              required 
            />
          </label>
          <button type="submit">Go to Verification Page</button>
        </form>
      )}
      
      <p>
        {isRegistered ? (
          <button 
            className="text-link" 
            onClick={() => {
              setIsRegistered(false);
              setSuccessMsg(null);
              setErrorMsg(null);
            }}
          >
            Back to Registration
          </button>
        ) : (
         
          <span> <br /> <br />Already have an account? <Link to="/">Login Here</Link></span>
        )}
      </p>
    </div>
  );
}

export default Register;
