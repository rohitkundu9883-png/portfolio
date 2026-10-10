const fs = require('fs');
const path = require('path');

// Minimal valid single-page PDF with readable text
const pdfContent = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>
endobj
4 0 obj
<< /Length 285 >>
stream
BT
/F1 22 Tf
50 720 Td
(Alex Rivera - Senior Full-Stack Engineer) Tj
/F1 12 Tf
0 -30 Td
(Email: alex.rivera.developer@gmail.com | Portfolio: alexrivera.dev | San Francisco, CA) Tj
0 -40 Td
(SUMMARY: Over 6+ years building resilient web apps, cloud architectures, & AI platforms.) Tj
0 -30 Td
(EXPERIENCE:) Tj
0 -20 Td
(- Nexus Systems: Staff Full-Stack Architect (2023 - Present)) Tj
0 -20 Td
(- Veloce Technologies: Senior Software Engineer (2021 - 2023)) Tj
0 -20 Td
(- Aura Labs: Full-Stack Software Developer (2019 - 2021)) Tj
0 -40 Td
(EDUCATION: B.S. in Computer Science - UC Berkeley (Summa Cum Laude)) Tj
ET
endstream
endobj
5 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
xref
0 6
0000000000 65535 f 
0000000010 00000 n 
0000000060 00000 n 
0000000117 00000 n 
0000000234 00000 n 
0000000570 00000 n 
trailer
<< /Size 6 /Root 1 0 R >>
startxref
643
%%EOF`;

const targetPath = path.join(__dirname, '..', 'public', 'uploads', 'Alex_Rivera_Resume.pdf');
fs.writeFileSync(targetPath, pdfContent.trim(), 'utf8');
console.log('Sample PDF created at:', targetPath);
