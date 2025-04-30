import * as nodemailer from 'nodemailer';
import { EmailConfig } from '../multichain.config';

// Store the last alert time for each alert type to prevent spam
const lastAlertTimes: Record<string, number> = {};

/**
 * Create a nodemailer transporter based on the email configuration
 */
function createTransporter(emailConfig: EmailConfig) {
  // If sendmail is enabled, use sendmail transport
  if (emailConfig.sendmail) {
    return nodemailer.createTransport({
      sendmail: true,
      newline: emailConfig.newline || 'unix',
      path: emailConfig.path || '/usr/sbin/sendmail'
    });
  }
  
  // If host, port, and secure are provided, use them
  if (emailConfig.host && emailConfig.port !== undefined && emailConfig.secure !== undefined) {
    return nodemailer.createTransport({
      host: emailConfig.host,
      port: emailConfig.port,
      secure: emailConfig.secure,
      auth: emailConfig.auth
    });
  }
  
  // Otherwise, use the service
  return nodemailer.createTransport({
    service: emailConfig.service,
    auth: emailConfig.auth
  });
}

/**
 * Send an email notification
 */
export async function sendEmailNotification(
  emailConfig: EmailConfig,
  subject: string,
  text: string,
  alertType: string
): Promise<boolean> {
  if (!emailConfig.enabled) {
    console.log(`Email notifications are disabled. Would have sent: ${subject}`);
    return false;
  }
  
  // Check if we've sent an alert of this type recently
  const now = Date.now();
  const lastAlertTime = lastAlertTimes[alertType] || 0;
  if (now - lastAlertTime < emailConfig.alertCooldown) {
    console.log(`Skipping email alert "${subject}" due to cooldown (last sent ${Math.floor((now - lastAlertTime) / 1000 / 60)} minutes ago)`);
    return false;
  }
  
  try {
    const transporter = createTransporter(emailConfig);
    
    const mailOptions = {
      from: emailConfig.from,
      to: emailConfig.to,
      subject: `[Bridge Relayer] ${subject}`,
      text: text,
      html: `<p>${text.replace(/\n/g, '<br>')}</p>`
    };
    
    const info = await transporter.sendMail(mailOptions);
    console.log(`Email sent: ${info.messageId}`);
    
    // Update the last alert time for this alert type
    lastAlertTimes[alertType] = now;
    
    return true;
  } catch (error) {
    console.error(`Error sending email notification:`, error);
    return false;
  }
}

/**
 * Send an RPC down alert
 */
export async function sendRpcDownAlert(
  emailConfig: EmailConfig,
  chainName: string,
  rpcUrl: string,
  error: any
): Promise<boolean> {
  const subject = `RPC Down Alert: ${chainName}`;
  const text = `
The RPC URL for ${chainName} is down or experiencing issues.

RPC URL: ${rpcUrl}

Error: ${error.message || error}

Timestamp: ${new Date().toISOString()}

The relayer will attempt to reconnect or use fallback RPC URLs if available.
`;
  
  return sendEmailNotification(emailConfig, subject, text, `rpc-down-${chainName}-${rpcUrl}`);
}

/**
 * Send a chain health alert
 */
export async function sendChainHealthAlert(
  emailConfig: EmailConfig,
  chainName: string,
  isHealthy: boolean,
  details: string
): Promise<boolean> {
  const subject = `Chain Health Alert: ${chainName} is ${isHealthy ? 'Healthy' : 'Unhealthy'}`;
  const text = `
The ${chainName} chain is now ${isHealthy ? 'healthy' : 'unhealthy'}.

Details: ${details}

Timestamp: ${new Date().toISOString()}
`;
  
  return sendEmailNotification(emailConfig, subject, text, `chain-health-${chainName}-${isHealthy}`);
}

/**
 * Send a relayer health alert
 */
export async function sendRelayerHealthAlert(
  emailConfig: EmailConfig,
  isHealthy: boolean,
  details: string
): Promise<boolean> {
  const subject = `Relayer Health Alert: Relayer is ${isHealthy ? 'Healthy' : 'Unhealthy'}`;
  const text = `
The bridge relayer is now ${isHealthy ? 'healthy' : 'unhealthy'}.

Details: ${details}

Timestamp: ${new Date().toISOString()}
`;
  
  return sendEmailNotification(emailConfig, subject, text, `relayer-health-${isHealthy}`);
}
