// Envío de correos con credenciales. Si no hay SMTP configurado, no falla:
// devuelve { success:false } y el sistema muestra la contraseña temporal al administrador.
const nodemailer = require('nodemailer');
const config = require('../config/config');

function crearTransporte() {
  const { service, host, port, user, pass } = config.email;
  if (service && user && pass) return nodemailer.createTransport({ service, auth: { user, pass } });
  if (host && user && pass) {
    return nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass } });
  }
  return null;
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function plantilla({ nombre, usuario, passwordTemporal, expira, estudianteNombre, matricula, motivo }) {
  const titulo = motivo === 'reactivacion' ? 'Su cuenta fue reactivada' : 'Bienvenido al Sistema de Gestión Escolar';
  const vence = expira.toLocaleString('es-PE', { dateStyle: 'long', timeStyle: 'short' });
  const hijo = estudianteNombre
    ? `<p>Cuenta de seguimiento del estudiante <b>${esc(estudianteNombre)}</b> (matrícula ${esc(matricula)}).</p>` : '';
  return `
  <div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;border:1px solid #C8D9E6;border-radius:10px;overflow:hidden">
    <div style="background:#2F4156;color:#fff;padding:16px 20px"><h2 style="margin:0">${titulo}</h2></div>
    <div style="padding:20px;color:#2F4156">
      <p>Hola <b>${esc(nombre)}</b>,</p>${hijo}
      <p>Sus credenciales de acceso son:</p>
      <table style="background:#F5EFEB;border-radius:8px;padding:12px;width:100%">
        <tr><td>Usuario:</td><td><b>${esc(usuario)}</b></td></tr>
        <tr><td>Contraseña temporal:</td><td><b>${esc(passwordTemporal)}</b></td></tr>
      </table>
      <p>Deberá cambiarla en su primer ingreso. <b>Vence el ${esc(vence)}</b>.</p>
      <p><a href="${esc(config.frontendUrl)}">Ir al sistema</a></p>
    </div>
  </div>`;
}

async function enviarCredenciales(datos) {
  const transporte = crearTransporte();
  if (!transporte) {
    return { success: false, error: 'SMTP no configurado' };
  }
  try {
    const info = await transporte.sendMail({
      from: config.email.from,
      to: datos.correo,
      subject: datos.motivo === 'reactivacion' ? 'Cuenta reactivada - Sistema de Gestión Escolar' : 'Credenciales de acceso - Sistema de Gestión Escolar',
      html: plantilla(datos),
    });
    return { success: true, previewUrl: nodemailer.getTestMessageUrl(info) || null };
  } catch (err) {
    console.error('[email] no se pudo enviar:', err.message);
    return { success: false, error: err.message };
  }
}

module.exports = { enviarCredenciales };
