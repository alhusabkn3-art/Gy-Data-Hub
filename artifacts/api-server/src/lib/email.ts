import nodemailer from 'nodemailer';

const SMTP_HOST =
  process.env.SMTP_HOST?.trim() || '';

const SMTP_PORT =
  Number(process.env.SMTP_PORT || '587');

const SMTP_USER =
  process.env.SMTP_USER?.trim() || '';

const SMTP_PASS =
  process.env.SMTP_PASS || '';

const SMTP_FROM =
  process.env.SMTP_FROM?.trim() ||
  SMTP_USER;

const SMTP_SERVICE =
  process.env.SMTP_SERVICE?.trim() || '';

if (
  !SMTP_HOST &&
  !SMTP_SERVICE
) {
  console.warn(
    '[email] SMTP_HOST or SMTP_SERVICE is not configured. Email OTP will not be sent.',
  );
}

const transporter =
  SMTP_SERVICE
    ? nodemailer.createTransport({
        service: SMTP_SERVICE,
        auth: {
          user: SMTP_USER,
          pass: SMTP_PASS,
        },
      })
    : nodemailer.createTransport({
        host: SMTP_HOST,
        port: SMTP_PORT,
        secure: SMTP_PORT === 465,
        auth: {
          user: SMTP_USER,
          pass: SMTP_PASS,
        },
      });

export async function sendPinResetOtpEmail(
  email: string,
  otp: string,
  purpose: 'login' | 'purchase',
): Promise<void> {
  if (
    !SMTP_USER ||
    !SMTP_PASS ||
    (!SMTP_HOST && !SMTP_SERVICE)
  ) {
    throw new Error(
      'Email service is not configured.',
    );
  }

  const isPurchase =
    purpose === 'purchase';

  const subject = isPurchase
    ? 'GY DATA Purchase PIN Reset Code'
    : 'GY DATA Login PIN Reset Code';

  const pinName = isPurchase
    ? 'Purchase PIN'
    : 'Login PIN';

  await transporter.sendMail({
    from: SMTP_FROM,
    to: email,
    subject,

    text: [
      'GY DATA',
      '',
      `Your ${pinName} reset verification code is: ${otp}`,
      '',
      'This code expires in 5 minutes.',
      'Do not share this code with anyone.',
      '',
      'If you did not request this reset, you can safely ignore this email.',
    ].join('\n'),

    html: `
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width,initial-scale=1" />
          <title>${subject}</title>
        </head>

        <body
          style="
            margin:0;
            padding:0;
            background:#f4f7fb;
            font-family:Arial,Helvetica,sans-serif;
            color:#0B1F4E;
          "
        >
          <div
            style="
              max-width:520px;
              margin:40px auto;
              background:#ffffff;
              border-radius:18px;
              padding:32px 24px;
              box-shadow:0 8px 30px rgba(11,31,78,.08);
            "
          >
            <div
              style="
                text-align:center;
                font-size:26px;
                font-weight:800;
                color:#075CC4;
                margin-bottom:8px;
              "
            >
              GY DATA
            </div>

            <div
              style="
                text-align:center;
                color:#6B7FA3;
                font-size:14px;
                margin-bottom:28px;
              "
            >
              Endless Joy
            </div>

            <h2
              style="
                margin:0 0 10px;
                font-size:20px;
              "
            >
              ${pinName} Reset
            </h2>

            <p
              style="
                margin:0 0 24px;
                color:#64748b;
                font-size:14px;
                line-height:1.6;
              "
            >
              Use the verification code below to reset your
              ${pinName.toLowerCase()}.
            </p>

            <div
              style="
                text-align:center;
                background:#EFF6FF;
                border:1px solid #DBEAFE;
                border-radius:14px;
                padding:20px;
                margin-bottom:24px;
              "
            >
              <div
                style="
                  font-size:32px;
                  font-weight:800;
                  letter-spacing:8px;
                  color:#1D4ED8;
                "
              >
                ${otp}
              </div>
            </div>

            <p
              style="
                margin:0;
                color:#64748b;
                font-size:13px;
                line-height:1.6;
              "
            >
              This code expires in <strong>5 minutes</strong>.
              Never share this code with anyone.
            </p>

            <p
              style="
                margin:24px 0 0;
                color:#94a3b8;
                font-size:12px;
                line-height:1.5;
              "
            >
              If you did not request this reset, you can safely
              ignore this email.
            </p>
          </div>
        </body>
      </html>
    `,
  });
}

export async function verifyEmailTransport(): Promise<void> {
  if (
    !SMTP_USER ||
    !SMTP_PASS ||
    (!SMTP_HOST && !SMTP_SERVICE)
  ) {
    throw new Error(
      'Email service is not configured.',
    );
  }

  await transporter.verify();
}
