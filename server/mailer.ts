import nodemailer from 'nodemailer';

interface SmtpConfig {
  host?: string;
  port?: number;
  user?: string;
  pass?: string;
  from?: string;
}

function resolveSmtpConfig(settings?: any): SmtpConfig {
  return {
    host: settings?.smtp_host || process.env.SMTP_HOST || '',
    port: Number(settings?.smtp_port || process.env.SMTP_PORT || 587),
    user: settings?.smtp_user || process.env.SMTP_USER || '',
    pass: settings?.smtp_pass || process.env.SMTP_PASS || '',
    from: settings?.smtp_from || process.env.SMTP_FROM || settings?.smtp_user || process.env.SMTP_USER || 'no-reply@operations.local'
  };
}

export function isSmtpConfigured(settings?: any): boolean {
  const config = resolveSmtpConfig(settings);
  return Boolean(config.host && config.user && config.pass);
}

function createTransporter(config: SmtpConfig) {
  const isSecure = config.port === 465;
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: isSecure,
    auth: {
      user: config.user,
      pass: config.pass
    },
    tls: {
      rejectUnauthorized: false
    }
  });
}

export async function sendPasswordResetEmail(
  toEmail: string,
  code: string,
  ipAddress: string,
  settings?: any
): Promise<{ success: boolean; error?: string }> {
  const config = resolveSmtpConfig(settings);

  if (!isSmtpConfigured(settings)) {
    return {
      success: false,
      error: 'SMTP email server is not configured. Please configure your email server in Admin Settings or use your Private Emergency Recovery Key.'
    };
  }

  try {
    const transporter = createTransporter(config);

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #1e293b; }
    .container { max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }
    .header { background: #0F4C81; padding: 24px; text-align: center; color: #ffffff; }
    .header h1 { margin: 0; font-size: 20px; font-weight: 700; letter-spacing: -0.5px; }
    .header p { margin: 4px 0 0 0; font-size: 12px; color: rgba(255,255,255,0.8); }
    .body { padding: 32px 28px; }
    .intro { font-size: 14px; line-height: 1.6; color: #334155; margin-bottom: 20px; }
    .code-box { background: #f0f9ff; border: 2px dashed #0F4C81; border-radius: 10px; padding: 18px; text-align: center; margin: 24px 0; }
    .code-label { font-size: 11px; text-transform: uppercase; tracking: 1px; color: #0369a1; font-weight: 600; margin-bottom: 6px; }
    .code-value { font-size: 32px; font-family: 'SF Mono', Consolas, Monaco, monospace; font-weight: 800; color: #0F4C81; letter-spacing: 6px; }
    .warning { background: #fffbeb; border: 1px solid #fef3c7; border-radius: 8px; padding: 12px 16px; font-size: 12px; color: #92400e; margin: 20px 0; line-height: 1.5; }
    .footer { background: #f8fafc; padding: 18px; border-top: 1px solid #e2e8f0; font-size: 11px; text-align: center; color: #64748b; line-height: 1.4; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>${settings?.app_name || 'Shift Handover'} &bull; Security Alert</h1>
      <p>Administrator Account Verification</p>
    </div>
    <div class="body">
      <p class="intro">
        Hello Administrator,<br><br>
        We received a request to reset the administrator password for <strong>${settings?.team_name || 'Operations Team'}</strong>.
        Use the following one-time verification code to complete the verification:
      </p>

      <div class="code-box">
        <div class="code-label">Verification Code (Valid for 15 minutes)</div>
        <div class="code-value">${code}</div>
      </div>

      <div class="warning">
        <strong>Security Notice:</strong> This code will expire in 15 minutes. If you did not initiate this request from IP <code>${ipAddress || 'unknown'}</code>, please disregard this email. Your existing password and operational data remain fully secured.
      </div>
    </div>
    <div class="footer">
      This is an automated operational security dispatch from ${settings?.app_name || 'Shift Handover System'}.
    </div>
  </div>
</body>
</html>
    `;

    await transporter.sendMail({
      from: `"${settings?.app_name || 'Handover Operations'}" <${config.from}>`,
      to: toEmail,
      subject: `[${code}] Admin Password Reset Code - ${settings?.app_name || 'Shift Handover'}`,
      text: `Your password reset code is: ${code}. It expires in 15 minutes. Requested from IP: ${ipAddress}`,
      html
    });

    return { success: true };
  } catch (err: any) {
    return {
      success: false,
      error: err.message || 'Failed to dispatch email through SMTP server.'
    };
  }
}

export async function sendTestEmail(
  toEmail: string,
  settings?: any
): Promise<{ success: boolean; message: string; error?: string }> {
  const config = resolveSmtpConfig(settings);

  if (!isSmtpConfigured(settings)) {
    return {
      success: false,
      message: 'SMTP settings are incomplete. Please provide Host, Port, Username, and Password.'
    };
  }

  try {
    const transporter = createTransporter(config);
    await transporter.verify();

    await transporter.sendMail({
      from: `"${settings?.app_name || 'Handover System'}" <${config.from}>`,
      to: toEmail,
      subject: `Test Connection Successful - ${settings?.app_name || 'Shift Handover'}`,
      text: 'Congratulations! Your SMTP email server connection has been successfully established and tested.',
      html: `
        <div style="font-family: sans-serif; padding: 20px; color: #1e293b;">
          <h2 style="color: #0F4C81;">SMTP Connection Verified!</h2>
          <p>This test confirms that <strong>${settings?.app_name || 'Shift Handover'}</strong> can reliably dispatch real emails to <strong>${toEmail}</strong>.</p>
          <p style="color: #64748b; font-size: 12px;">Dispatched at: ${new Date().toLocaleString()}</p>
        </div>
      `
    });

    return {
      success: true,
      message: `Test email sent successfully to ${toEmail}. Check your inbox!`
    };
  } catch (err: any) {
    return {
      success: false,
      message: 'Failed to connect or send test email.',
      error: err.message || 'SMTP authentication failed.'
    };
  }
}
