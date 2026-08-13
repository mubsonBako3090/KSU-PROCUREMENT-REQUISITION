"use client";

import { useEffect, useRef, useState } from "react";
import axios from "axios";
import toast from "react-hot-toast";
import InputField from "@/components/forms/InputField";
import Button from "@/components/ui/Button";
import { ROLE_LABELS, ROLES } from "@/constants/roles";
import { getCollegeById, getFaculty } from "@/constants/colleges";
import styles from "./page.module.css";

export default function SettingsPage() {
  const [user, setUser] = useState(null);
  const [fullName, setFullName] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  const [passwordForm, setPasswordForm] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [savingPassword, setSavingPassword] = useState(false);
  const canvasRef = useRef(null);
  const drawingRef = useRef(false);
  const [signatureExists, setSignatureExists] = useState(false);
  const [signaturePassword, setSignaturePassword] = useState("");
  const [savingSignature, setSavingSignature] = useState(false);

  function setupCanvas() {
    const canvas=canvasRef.current; if(!canvas) return; const ratio=Math.max(window.devicePixelRatio||1,1);
    canvas.width=700*ratio; canvas.height=220*ratio; canvas.style.width="100%"; canvas.style.height="220px";
    const ctx=canvas.getContext("2d"); ctx.scale(ratio,ratio); ctx.lineWidth=2; ctx.lineCap="round"; ctx.strokeStyle="#111827";
  }
  function point(e){const r=canvasRef.current.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top};}
  function startDrawing(e){drawingRef.current=true;const p=point(e);const c=canvasRef.current.getContext("2d");c.beginPath();c.moveTo(p.x,p.y);}
  function draw(e){if(!drawingRef.current)return;e.preventDefault();const p=point(e);const c=canvasRef.current.getContext("2d");c.lineTo(p.x,p.y);c.stroke();}
  function stopDrawing(){drawingRef.current=false;}
  function clearSignature(){const c=canvasRef.current;if(!c)return;c.getContext("2d").clearRect(0,0,700,220);}
  async function saveSignature(e){e.preventDefault();const c=canvasRef.current;if(!c)return;const blank=document.createElement("canvas");blank.width=c.width;blank.height=c.height;if(c.toDataURL()===blank.toDataURL())return toast.error("Please draw your signature first.");if(!signaturePassword)return toast.error("Enter your current password to save the signing credential.");setSavingSignature(true);try{const{data}=await axios.post("/api/users/me/signature",{signature:c.toDataURL("image/png"),currentPassword:signaturePassword});setSignatureExists(true);setSignaturePassword("");clearSignature();toast.success(data.message);}catch(err){toast.error(err.response?.data?.message||"Failed to save signature.");}finally{setSavingSignature(false);}}

  useEffect(() => {
    axios
      .get("/api/users/me")
      .then(({ data }) => {
        setUser(data.user);
        setFullName(data.user.fullName);
      })
      .catch((err) => toast.error(err.response?.data?.message || "Failed to load profile."));
  }, []);

  useEffect(() => {
    if (user?.role !== ROLES.VC) return;
    axios.get("/api/users/me/signature").then(({data})=>setSignatureExists(data.hasSignature)).catch(()=>{});
    setupCanvas(); window.addEventListener("resize",setupCanvas); return ()=>window.removeEventListener("resize",setupCanvas);
  }, [user?.role]);

  async function handleProfileSave(e) {
    e.preventDefault();
    setSavingProfile(true);
    try {
      const { data } = await axios.patch("/api/users/me", { fullName });
      setUser(data.user);
      toast.success("Profile updated.");
    } catch (err) {
      toast.error(err.response?.data?.message || "Update failed.");
    } finally {
      setSavingProfile(false);
    }
  }

  async function handlePasswordSave(e) {
    e.preventDefault();
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      toast.error("New passwords do not match.");
      return;
    }
    setSavingPassword(true);
    try {
      await axios.post("/api/auth/change-password", {
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword,
      });
      toast.success("Password updated.");
      setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
    } catch (err) {
      toast.error(err.response?.data?.message || "Password change failed.");
    } finally {
      setSavingPassword(false);
    }
  }

  if (!user) return <p>Loading…</p>;

  const college = getCollegeById(user.collegeId);
  const faculty = getFaculty(user.collegeId, user.facultyId);

  return (
    <div className={styles.wrapper}>
      <h1 className={styles.heading}>Settings</h1>

      <section className={styles.section}>
        <h4 className={styles.sectionTitle}>Profile</h4>
        <form onSubmit={handleProfileSave} className={styles.form}>
          <InputField id="fullName" label="Full name" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
          <InputField id="email" label="Email address" value={user.email} disabled />
          <InputField id="role" label="Role" value={ROLE_LABELS[user.role] || user.role} disabled />
          <InputField id="college" label="College" value={college?.name || "-"} disabled />
          <InputField id="faculty" label="Faculty" value={faculty?.name || "-"} disabled />
          <InputField id="department" label="Department" value={user.department} disabled />
          <Button type="submit" loading={savingProfile}>
            Save Profile
          </Button>
        </form>
      </section>

      <section className={styles.section}>
        <h4 className={styles.sectionTitle}>Change Password</h4>
        <form onSubmit={handlePasswordSave} className={styles.form}>
          <InputField
            id="currentPassword"
            label="Current password"
            type="password"
            required
            value={passwordForm.currentPassword}
            onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })}
          />
          <InputField
            id="newPassword"
            label="New password"
            type="password"
            required
            minLength={8}
            value={passwordForm.newPassword}
            onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
          />
          <InputField
            id="confirmPassword"
            label="Confirm new password"
            type="password"
            required
            minLength={8}
            value={passwordForm.confirmPassword}
            onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
          />
          <Button type="submit" loading={savingPassword}>
            Update Password
          </Button>
        </form>
      </section>

      {user.role === ROLES.VC && (
        <section className={styles.section}>
          <h4 className={styles.sectionTitle}>VC Digital Signature</h4>
          <p className={styles.signatureHint}>The signature is encrypted at rest and only released by the server during an explicitly authorized Procurement Batch signing action. Replacing it requires your current password.</p>
          <div className={styles.signatureCanvasWrap}>
            <canvas ref={canvasRef} className={styles.signatureCanvas} onPointerDown={startDrawing} onPointerMove={draw} onPointerUp={stopDrawing} onPointerLeave={stopDrawing} onPointerCancel={stopDrawing} />
            <span className={styles.signatureLine}>Draw signature here</span>
          </div>
          <div className={styles.signatureActions}><Button type="button" variant="secondary" onClick={clearSignature}>Clear</Button></div>
          <form onSubmit={saveSignature} className={styles.form}>
            <InputField id="signaturePassword" label="Current password" type="password" required value={signaturePassword} onChange={(e)=>setSignaturePassword(e.target.value)} />
            <Button type="submit" loading={savingSignature}>{signatureExists ? "Replace Digital Signature" : "Save Digital Signature"}</Button>
          </form>
          {signatureExists && <p className={styles.signatureSaved}><i className="bi bi-shield-check" /> A VC signing credential is configured for this account.</p>}
        </section>
      )}

      <section className={styles.section}>
        <h4 className={styles.sectionTitle}>System Info</h4>
        <dl className={styles.infoDl}>
          <dt>Application</dt>
          <dd>KSU Procurement Requisition System</dd>
          <dt>Institution</dt>
          <dd>Kaduna State University</dd>
        </dl>
      </section>
    </div>
  );
}
