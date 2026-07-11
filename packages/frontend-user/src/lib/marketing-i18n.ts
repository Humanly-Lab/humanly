/**
 * Marketing-site i18n (landing, about, research, docs).
 *
 * Locale is stored in a cookie and read server-side by the marketing pages, so
 * URLs stay unchanged and the product app is untouched. Adding a language =
 * adding a dictionary entry here and a row in MARKETING_LOCALES.
 *
 * Product-mock content inside the hero showcase intentionally stays English:
 * it depicts the product UI, which ships in English.
 */

export const MARKETING_LOCALE_COOKIE = 'humanly-lang';

export const MARKETING_LOCALES = [
  { code: 'en', label: 'English' },
  { code: 'zh-CN', label: '简体中文' },
  { code: 'ja', label: '日本語' },
  { code: 'es', label: 'Español' },
  { code: 'fr', label: 'Français' },
] as const;

export type MarketingLocale = (typeof MARKETING_LOCALES)[number]['code'];

export const normalizeMarketingLocale = (
  value: string | undefined | null
): MarketingLocale =>
  MARKETING_LOCALES.some((locale) => locale.code === value)
    ? (value as MarketingLocale)
    : 'en';

const en = {
  nav: {
    learnMore: 'Learn More',
    blog: 'Research',
    docs: 'Docs',
    resources: 'Resources',
    github: 'GitHub',
    help: 'Help',
    about: 'About',
    logIn: 'Log in',
    signUp: 'Create Account',
  },
  footer: {
    taglineLine1: 'Every piece of writing has a story.',
    taglineLine2: 'Now you can prove it.',
    product: 'Product',
    resources: 'Resources',
    company: 'Company',
    startWriting: 'Start writing',
    liveDemo: 'Live demo',
    github: 'GitHub',
    docs: 'Docs',
    help: 'Help',
    blog: 'Research',
    about: 'About',
    contact: 'Contact',
    privacy: 'Privacy policy',
    terms: 'Terms of service',
    copyright: '© 2026 Humanly Lab. All rights reserved.',
  },
  home: {
    heroTitleLine1: 'Humanly is your configurable and traceable',
    heroTitleLine2: 'Human-AI collaborative writing platform',
    heroSubtitlePre: 'Every piece of writing has a ',
    heroSubtitleStory: 'story',
    heroSubtitlePost: '. Now you can prove it.',
    startWriting: 'Start writing',
    tryLiveDemo: 'Try the live demo',
    statementTitlePre: 'Did you write this, ',
    statementTitleMuted: 'or did AI?',
    statementBody:
      'AI detectors estimate authenticity from the finished text. Humanly records the writing process directly, showing how the text was composed from typing, paste, and AI assistance.',
    tryItTitle: 'How does Humanly work?',
    tryItBody:
      'Configure a writing environment, draft under the policy, record the activity log, and generate a signed certificate.',
    faqTitle: 'Common Q&A',
    faqs: [
      [
        'Why is final text not enough?',
        'A final document cannot show whether it came from human typing, AI generation, or mixed human-AI writing. Humanly records the writing process itself.',
      ],
      [
        'What does Humanly record?',
        'Humanly records in-platform writing activity, including text edits, clipboard actions, workspace status, and AI assistance, then turns them into logs and replay.',
      ],
      [
        'Who controls the writing rules?',
        'The owner configures the writing environment before drafting starts, including AI access, copy-paste rules, resources, timing, length bounds, and detectors.',
      ],
      [
        'What does a certificate show?',
        'A certificate packages authorship statistics, environment settings, activity log, replay, anomaly behavior review, and signature verification.',
      ],
      [
        'How does Humanly help prevent cheating?',
        'Humanly uses two-layer anomaly detection: statistic-based anomaly patterns and model-based human typing detection. These signals surface suspicious behavior for review, rather than making an automatic verdict.',
      ],
    ] as ReadonlyArray<readonly [string, string]>,
    demoTitle: 'Humanly Demo',
    demoBody: 'See Humanly turn writing into verifiable evidence.',
    openDemo: 'Open Demo',
  },
  about: {
    metaTitle: 'About — Humanly',
    eyebrow: 'About',
    heroTitle: 'Making human-AI writing configurable and traceable',
    heroBody:
      'Humanly is a configurable writing platform that records how a document is created, including human editing and AI assistance. It turns that process into an activity log and signed certificate.',
    researchTitle: 'Who we are',
    researchBody:
      'Humanly Lab is a research-led team building practical infrastructure for writing in the age of AI. Humanly began as a research project and is becoming a product for everyone. We work across UT Austin, University of Toronto, and Stanford University.',
    beliefs: [
      [
        "What we're building",
        'An end-to-end, configurable and traceable environment for human-AI collaborative writing, available as both a self-hosted local deployment and a managed SaaS product.',
      ],
      [
        'Why it matters',
        'Finished text cannot show how it was produced. Humanly preserves the process so instructors, researchers, and readers can review evidence instead of guessing from the output.',
      ],
      [
        'How Humanly is available',
        'Humanly is available as a managed SaaS product and an institution-ready self-hosted deployment. The current research release is open source. Future commercial offerings may include enterprise licensing, deployment support, and custom integrations.',
      ],
    ] as ReadonlyArray<readonly [string, string]>,
    teamTitle: 'Meet our Humanly team',
    teamBody:
      'Researchers across six institutions, working on writing provenance, human-AI collaboration, and behavioral analysis.',
    ctaTitle: 'See the platform behind the research',
    ctaDemo: 'Try the live demo',
    ctaResearch: 'Read our research',
  },
  blog: {
    metaTitle: 'Research — Humanly',
    eyebrow: 'Research',
    heroTitle: 'Research',
    heroBody:
      'Humanly is research infrastructure as much as product. We study how human authenticity can be understood and verified in the age of AI agents.',
    publicationsTitle: 'Publications',
    underReview: 'Under review',
    venue: 'EMNLP 2026 System Demonstrations',
    paperSummary: 'Humanly Tech Report',
    codeLink: 'Paper',
    demoLink: 'Live demo',
    seriesNote:
      'This is the first paper in a series. Follow-up work built on the platform is in progress.',
    directionsTitle: 'Directions we are pursuing',
    directions: [
      [
        'Behavioral AI-use detection',
        'Writing trajectories carry signals that finished text does not. We study how typing behavior separates compliant in-platform AI use from covert external AI use.',
      ],
      [
        'Provenance standards for writing',
        'What should count as evidence of authorship? We work on certificate formats, signing, and verification flows that third parties can trust without trusting us.',
      ],
      [
        'Human-AI collaboration at scale',
        'The platform records how people actually draft, revise, and delegate to AI. This process data enables studies of collaborative writing that final documents cannot support.',
      ],
    ] as ReadonlyArray<readonly [string, string]>,
    ctaTitle: 'Interested in collaborating?',
    ctaBody:
      'We work with researchers, instructors, and institutions studying human writing authenticity in the age of AI.',
    ctaButton: 'Get in touch',
  },
  docs: {
    metaTitle: 'Docs — Humanly',
    eyebrow: 'Docs',
    title: 'Documentation is on its way.',
    body: 'We are writing guides for writers, publishers, and self-hosters. In the meantime, the README covers setup and self-deployment.',
    readme: 'View the README ↗',
  },
};

export type MarketingDict = typeof en;

const zhCN: MarketingDict = {
  nav: {
    learnMore: '了解更多',
    blog: '研究',
    docs: '文档',
    resources: '资源',
    github: 'GitHub',
    help: '帮助',
    about: '关于我们',
    logIn: '登录',
    signUp: '注册',
  },
  footer: {
    taglineLine1: '每一篇文字都有自己的故事。',
    taglineLine2: '现在，你可以证明它。',
    product: '产品',
    resources: '资源',
    company: '公司',
    startWriting: '开始写作',
    liveDemo: '在线演示',
    github: 'GitHub',
    docs: '文档',
    help: '帮助',
    blog: '研究',
    about: '关于我们',
    contact: '联系我们',
    privacy: '隐私政策',
    terms: '服务条款',
    copyright: '© 2026 Humanly Lab 保留所有权利。',
  },
  home: {
    heroTitleLine1: 'Humanly：可配置、可追溯的',
    heroTitleLine2: '人机协作写作平台',
    heroSubtitlePre: '每一篇文字都有自己的',
    heroSubtitleStory: '故事',
    heroSubtitlePost: '。现在，你可以证明它。',
    startWriting: '开始写作',
    tryLiveDemo: '体验在线演示',
    statementTitlePre: '这是你写的，',
    statementTitleMuted: '还是 AI 写的？',
    statementBody:
      'AI 检测器只能根据成稿猜测真实性。Humanly 直接记录写作过程，展示文本如何由键入、粘贴与 AI 协助共同构成。',
    tryItTitle: 'Humanly 如何工作？',
    tryItBody:
      '配置写作环境，在既定规则下写作，记录完整活动日志，最终生成带签名的证书。',
    faqTitle: '常见问题',
    faqs: [
      [
        '为什么只看成稿不够？',
        '最终文档无法说明内容来自人工键入、AI 生成，还是人机混合写作。Humanly 记录的是写作过程本身。',
      ],
      [
        'Humanly 会记录什么？',
        'Humanly 记录平台内的写作活动，包括文本编辑、剪贴板操作、工作区状态与 AI 协助，并生成日志与回放。',
      ],
      [
        '写作规则由谁决定？',
        '所有者在写作开始前配置环境，包括 AI 权限、复制粘贴规则、资料访问、时间限制、字数范围与检测器。',
      ],
      [
        '证书包含哪些内容？',
        '证书打包了作者行为统计、环境设置、活动日志、轨迹回放、异常行为审查与签名验证。',
      ],
      [
        'Humanly 如何帮助防止作弊？',
        'Humanly 使用两层异常检测：基于统计的异常模式与基于模型的人类打字检测。这些信号用于提示可疑行为供人工审查，而非自动下结论。',
      ],
    ],
    demoTitle: 'Humanly 演示',
    demoBody: '看 Humanly 如何把写作过程变成可验证的证据。',
    openDemo: '打开演示',
  },
  about: {
    metaTitle: '关于我们 — Humanly',
    eyebrow: '关于我们',
    heroTitle: '每一次写作，都值得可验证的故事。',
    heroBody:
      'Humanly Lab 为 AI 辅助写作时代构建溯源基础设施。我们不去猜测成稿是否出自人手，而是记录写作过程本身——每一次键入、粘贴与 AI 交互——并将其转化为可验证的作者证据。',
    researchTitle: '源于研究',
    researchBody:
      'Humanly 始于一项关于大模型时代写作真实性的研究项目，由来自 UT Austin、多伦多大学、斯坦福、MIT、USC 与 KAUST 的研究者共同构建。我们的首篇论文——介绍该平台及其基于写作轨迹的作者认证方法——正在 EMNLP 2026 System Demonstrations 评审中，平台本身完全开源。我们是研究驱动的团队：研究验证什么，产品就交付什么。',
    beliefs: [
      [
        '溯源优于检测',
        '事后 AI 检测器只能从成稿猜测，且双向都会出错。记录文本的写作过程，得到的是证据而非估计。',
      ],
      [
        '透明优于禁止',
        'AI 已经是写作的一部分。答案不是禁用它，而是让它的参与可见、可配置，让每个场景都能设定自己的规则。',
      ],
      [
        '研究进入生产',
        'Humanly 既是产品也是研究工具。为写作签发证书的同一套基础设施，也支撑着我们对人们如何与 AI 协作写作的研究。',
      ],
    ],
    teamTitle: '团队',
    teamBody: '来自六所机构的研究者，专注写作溯源、人机协作与行为分析。',
    ctaTitle: '看看研究背后的平台',
    ctaDemo: '体验在线演示',
    ctaResearch: '阅读我们的研究',
  },
  blog: {
    metaTitle: '研究 — Humanly',
    eyebrow: '研究',
    heroTitle: '研究',
    heroBody: 'Humanly 既是产品，也是研究基础设施。',
    publicationsTitle: '论文',
    underReview: '评审中',
    venue: 'EMNLP 2026 System Demonstrations',
    paperSummary: 'Humanly 技术报告',
    codeLink: '论文',
    demoLink: '在线演示',
    seriesNote: '这是系列研究的第一篇。基于该平台的后续工作正在进行中。',
    directionsTitle: '我们正在探索的方向',
    directions: [
      [
        '基于行为的 AI 使用检测',
        '写作轨迹携带着成稿所没有的信号。我们研究打字行为如何区分合规的平台内 AI 使用与隐蔽的外部 AI 使用。',
      ],
      [
        '写作溯源标准',
        '什么才算作者身份的证据？我们研究证书格式、签名与验证流程，让第三方无需信任我们也能信任证书。',
      ],
      [
        '规模化的人机协作研究',
        '平台记录了人们实际的起草、修改与 AI 委托过程。这些过程数据支撑着仅靠成稿无法开展的协作写作研究。',
      ],
    ],
    ctaTitle: '有兴趣合作吗？',
    ctaBody: '我们与研究 AI 时代人类写作真实性的研究者、教师与机构合作。',
    ctaButton: '联系我们',
  },
  docs: {
    metaTitle: '文档 — Humanly',
    eyebrow: '文档',
    title: '文档正在编写中。',
    body: '我们正在为写作者、发布者与自部署用户编写指南。在此之前，README 涵盖了安装与自部署说明。',
    readme: '查看 README ↗',
  },
};

const ja: MarketingDict = {
  nav: {
    learnMore: '詳しく見る',
    blog: '研究',
    docs: 'ドキュメント',
    resources: 'リソース',
    github: 'GitHub',
    help: 'ヘルプ',
    about: '私たちについて',
    logIn: 'ログイン',
    signUp: '新規登録',
  },
  footer: {
    taglineLine1: 'すべての文章には物語がある。',
    taglineLine2: 'いま、それを証明できる。',
    product: '製品',
    resources: 'リソース',
    company: '会社',
    startWriting: '執筆を始める',
    liveDemo: 'ライブデモ',
    github: 'GitHub',
    docs: 'ドキュメント',
    help: 'ヘルプ',
    blog: '研究',
    about: '私たちについて',
    contact: 'お問い合わせ',
    privacy: 'プライバシーポリシー',
    terms: '利用規約',
    copyright: '© 2026 Humanly Lab. All rights reserved.',
  },
  home: {
    heroTitleLine1: 'Humanly は、設定可能で追跡可能な',
    heroTitleLine2: '人間と AI の共同執筆プラットフォーム',
    heroSubtitlePre: 'すべての文章には',
    heroSubtitleStory: '物語',
    heroSubtitlePost: 'がある。いま、それを証明できる。',
    startWriting: '執筆を始める',
    tryLiveDemo: 'ライブデモを試す',
    statementTitlePre: 'これはあなたが書いた？',
    statementTitleMuted: 'それとも AI？',
    statementBody:
      'AI 検出器は完成した文章から真正性を推測するだけです。Humanly は執筆プロセスそのものを記録し、タイピング・貼り付け・AI 支援がどのように文章を構成したかを示します。',
    tryItTitle: 'Humanly の仕組み',
    tryItBody:
      '執筆環境を設定し、ルールのもとで執筆し、活動ログを記録し、署名付き証明書を生成します。',
    faqTitle: 'よくある質問',
    faqs: [
      [
        'なぜ完成した文章だけでは不十分なのですか？',
        '最終的な文書からは、人間のタイピング、AI 生成、あるいは人間と AI の混合執筆のどれに由来するかを判別できません。Humanly は執筆プロセスそのものを記録します。',
      ],
      [
        'Humanly は何を記録しますか？',
        'Humanly はプラットフォーム内の執筆活動（テキスト編集、クリップボード操作、ワークスペースの状態、AI 支援）を記録し、ログとリプレイに変換します。',
      ],
      [
        '執筆ルールは誰が決めますか？',
        'オーナーが執筆開始前に環境を設定します。AI アクセス、コピー＆ペーストのルール、資料、時間制限、文字数の範囲、検出器などが含まれます。',
      ],
      [
        '証明書には何が含まれますか？',
        '証明書には、執筆統計、環境設定、活動ログ、リプレイ、異常行動レビュー、署名検証が含まれます。',
      ],
      [
        'Humanly は不正防止にどう役立ちますか？',
        'Humanly は二層の異常検出を使用します。統計ベースの異常パターンと、モデルベースの人間タイピング検出です。これらのシグナルは自動判定ではなく、レビューのために疑わしい行動を提示します。',
      ],
    ],
    demoTitle: 'Humanly デモ',
    demoBody: 'Humanly が執筆を検証可能な証拠に変える様子をご覧ください。',
    openDemo: 'デモを開く',
  },
  about: {
    metaTitle: '私たちについて — Humanly',
    eyebrow: '私たちについて',
    heroTitle: 'すべての執筆に、検証可能な物語を。',
    heroBody:
      'Humanly Lab は、AI 支援執筆時代のための来歴（プロベナンス）基盤を構築しています。完成した文章が人間の手によるものかを推測するのではなく、執筆プロセスそのもの——すべてのキー入力、貼り付け、AI とのやり取り——を記録し、検証可能な著者性の証拠に変えます。',
    researchTitle: '研究から生まれた',
    researchBody:
      'Humanly は、LLM 時代の執筆の真正性に関する研究プロジェクトとして始まり、UT Austin、トロント大学、スタンフォード、MIT、USC、KAUST の研究者によって構築されました。プラットフォームとその執筆軌跡に基づく著者性へのアプローチを紹介する最初の論文は、EMNLP 2026 System Demonstrations で査読中であり、プラットフォーム自体はオープンソースです。私たちは研究主導のチームです。研究が検証したものを、製品として届けます。',
    beliefs: [
      [
        '検出よりも来歴',
        '事後的な AI 検出器は完成文から推測するため、双方向に誤ります。文章がどう書かれたかを記録すれば、推定ではなく証拠が得られます。',
      ],
      [
        '禁止よりも透明性',
        'AI はすでに執筆の一部です。答えは禁止ではなく、その役割を可視化・設定可能にし、それぞれの場面が独自のルールを設定できるようにすることです。',
      ],
      [
        '研究を実運用へ',
        'Humanly は製品であると同時に研究装置です。執筆を証明するのと同じ基盤が、人々が実際に AI とどう書くかについての研究を支えています。',
      ],
    ],
    teamTitle: 'チーム',
    teamBody:
      '6 つの機関にまたがる研究者が、執筆の来歴、人間と AI の協働、行動分析に取り組んでいます。',
    ctaTitle: '研究を支えるプラットフォームを見る',
    ctaDemo: 'ライブデモを試す',
    ctaResearch: '研究を読む',
  },
  blog: {
    metaTitle: '研究 — Humanly',
    eyebrow: '研究',
    heroTitle: '研究',
    heroBody: 'Humanly は製品であると同時に研究基盤です。',
    publicationsTitle: '論文',
    underReview: '査読中',
    venue: 'EMNLP 2026 System Demonstrations',
    paperSummary: 'Humanly テクニカルレポート',
    codeLink: '論文',
    demoLink: 'ライブデモ',
    seriesNote:
      'これはシリーズ最初の論文です。プラットフォームを基盤とした後続研究が進行中です。',
    directionsTitle: '探求している方向性',
    directions: [
      [
        '行動ベースの AI 利用検出',
        '執筆の軌跡には、完成文にはないシグナルが含まれます。タイピング行動が、プラットフォーム内での適切な AI 利用と、隠れた外部 AI 利用をどう区別するかを研究しています。',
      ],
      [
        '執筆来歴の標準',
        '何が著者性の証拠となるべきか。第三者が私たちを信頼しなくても信頼できる、証明書のフォーマット、署名、検証フローに取り組んでいます。',
      ],
      [
        '大規模な人間と AI の協働',
        'プラットフォームは、人々が実際にどう起草し、修正し、AI に委ねるかを記録します。このプロセスデータは、完成文だけでは不可能な協働執筆の研究を可能にします。',
      ],
    ],
    ctaTitle: '共同研究に興味がありますか？',
    ctaBody:
      'AI 時代の人間による執筆の真正性を研究する研究者、教育者、機関と協力しています。',
    ctaButton: 'お問い合わせ',
  },
  docs: {
    metaTitle: 'ドキュメント — Humanly',
    eyebrow: 'ドキュメント',
    title: 'ドキュメントは準備中です。',
    body: 'ライター、パブリッシャー、セルフホスト向けのガイドを執筆中です。それまでは、README にセットアップとセルフデプロイの説明があります。',
    readme: 'README を見る ↗',
  },
};

const es: MarketingDict = {
  nav: {
    learnMore: 'Saber más',
    blog: 'Investigación',
    docs: 'Documentación',
    resources: 'Recursos',
    github: 'GitHub',
    help: 'Ayuda',
    about: 'Nosotros',
    logIn: 'Iniciar sesión',
    signUp: 'Registrarse',
  },
  footer: {
    taglineLine1: 'Cada texto tiene una historia.',
    taglineLine2: 'Ahora puedes demostrarla.',
    product: 'Producto',
    resources: 'Recursos',
    company: 'Compañía',
    startWriting: 'Empezar a escribir',
    liveDemo: 'Demo en vivo',
    github: 'GitHub',
    docs: 'Documentación',
    help: 'Ayuda',
    blog: 'Investigación',
    about: 'Nosotros',
    contact: 'Contacto',
    privacy: 'Política de privacidad',
    terms: 'Términos de servicio',
    copyright: '© 2026 Humanly Lab. Todos los derechos reservados.',
  },
  home: {
    heroTitleLine1: 'Humanly es tu plataforma configurable y trazable',
    heroTitleLine2: 'de escritura colaborativa humano-IA',
    heroSubtitlePre: 'Cada texto tiene una ',
    heroSubtitleStory: 'historia',
    heroSubtitlePost: '. Ahora puedes demostrarla.',
    startWriting: 'Empezar a escribir',
    tryLiveDemo: 'Probar la demo en vivo',
    statementTitlePre: '¿Lo escribiste tú, ',
    statementTitleMuted: 'o fue la IA?',
    statementBody:
      'Los detectores de IA estiman la autenticidad a partir del texto final. Humanly registra directamente el proceso de escritura, mostrando cómo se compuso el texto entre tecleo, pegado y asistencia de IA.',
    tryItTitle: '¿Cómo funciona Humanly?',
    tryItBody:
      'Configura un entorno de escritura, redacta bajo sus reglas, registra el historial de actividad y genera un certificado firmado.',
    faqTitle: 'Preguntas frecuentes',
    faqs: [
      [
        '¿Por qué no basta con el texto final?',
        'Un documento final no puede mostrar si proviene de teclado humano, generación por IA o escritura mixta humano-IA. Humanly registra el proceso de escritura en sí.',
      ],
      [
        '¿Qué registra Humanly?',
        'Humanly registra la actividad de escritura dentro de la plataforma: ediciones de texto, acciones del portapapeles, estado del espacio de trabajo y asistencia de IA, y la convierte en registros y repetición.',
      ],
      [
        '¿Quién controla las reglas de escritura?',
        'El propietario configura el entorno antes de empezar: acceso a IA, reglas de copiar y pegar, recursos, tiempos, límites de longitud y detectores.',
      ],
      [
        '¿Qué muestra un certificado?',
        'Un certificado reúne estadísticas de autoría, configuración del entorno, registro de actividad, repetición, revisión de anomalías y verificación de firma.',
      ],
      [
        '¿Cómo ayuda Humanly a prevenir trampas?',
        'Humanly usa detección de anomalías en dos capas: patrones estadísticos y detección de tecleo humano basada en modelos. Estas señales destacan comportamientos sospechosos para revisión, sin emitir un veredicto automático.',
      ],
    ],
    demoTitle: 'Demo de Humanly',
    demoBody: 'Mira cómo Humanly convierte la escritura en evidencia verificable.',
    openDemo: 'Abrir demo',
  },
  about: {
    metaTitle: 'Nosotros — Humanly',
    eyebrow: 'Nosotros',
    heroTitle: 'La escritura merece una historia verificable.',
    heroBody:
      'Humanly Lab construye infraestructura de procedencia para la era de la escritura asistida por IA. En lugar de adivinar si un texto terminado fue escrito por un humano, registramos el proceso de escritura en sí — cada tecleo, pegado e interacción con IA — y lo convertimos en evidencia verificable de autoría.',
    researchTitle: 'Nacido de la investigación',
    researchBody:
      'Humanly comenzó como un proyecto de investigación sobre la autenticidad de la escritura en la era de los LLM, construido por investigadores de UT Austin, la Universidad de Toronto, Stanford, MIT, USC y KAUST. Nuestro primer artículo — que presenta la plataforma y su enfoque de autoría basado en trayectorias — está en revisión en EMNLP 2026 System Demonstrations, y la plataforma es de código abierto. Somos un equipo basado en investigación: el producto entrega lo que la investigación valida.',
    beliefs: [
      [
        'Procedencia sobre detección',
        'Los detectores de IA a posteriori adivinan a partir del texto final y fallan en ambas direcciones. Registrar cómo se escribió un texto produce evidencia en lugar de estimaciones.',
      ],
      [
        'Transparencia sobre prohibición',
        'La IA ya es parte de cómo escribimos. La respuesta no es prohibirla, sino hacer visible y configurable su papel, para que cada contexto defina sus propias reglas.',
      ],
      [
        'Investigación en producción',
        'Humanly es a la vez producto e instrumento de investigación. La misma infraestructura que certifica la escritura impulsa nuestros estudios sobre cómo la gente escribe realmente con IA.',
      ],
    ],
    teamTitle: 'Equipo',
    teamBody:
      'Investigadores de seis instituciones trabajando en procedencia de la escritura, colaboración humano-IA y análisis de comportamiento.',
    ctaTitle: 'Conoce la plataforma detrás de la investigación',
    ctaDemo: 'Probar la demo en vivo',
    ctaResearch: 'Leer nuestra investigación',
  },
  blog: {
    metaTitle: 'Investigación — Humanly',
    eyebrow: 'Investigación',
    heroTitle: 'Investigación',
    heroBody:
      'Humanly es tanto infraestructura de investigación como producto.',
    publicationsTitle: 'Publicaciones',
    underReview: 'En revisión',
    venue: 'EMNLP 2026 System Demonstrations',
    paperSummary: 'Informe técnico de Humanly',
    codeLink: 'Artículo',
    demoLink: 'Demo en vivo',
    seriesNote:
      'Este es el primer artículo de una serie. El trabajo posterior construido sobre la plataforma está en curso.',
    directionsTitle: 'Direcciones que exploramos',
    directions: [
      [
        'Detección conductual del uso de IA',
        'Las trayectorias de escritura contienen señales que el texto final no tiene. Estudiamos cómo el comportamiento de tecleo separa el uso conforme de IA dentro de la plataforma del uso encubierto de IA externa.',
      ],
      [
        'Estándares de procedencia para la escritura',
        '¿Qué debería contar como evidencia de autoría? Trabajamos en formatos de certificado, firma y flujos de verificación en los que terceros puedan confiar sin confiar en nosotros.',
      ],
      [
        'Colaboración humano-IA a escala',
        'La plataforma registra cómo la gente realmente redacta, revisa y delega en la IA. Estos datos de proceso permiten estudios de escritura colaborativa que los documentos finales no pueden sostener.',
      ],
    ],
    ctaTitle: '¿Interesado en colaborar?',
    ctaBody:
      'Trabajamos con investigadores, docentes e instituciones que estudian la autenticidad de la escritura humana en la era de la IA.',
    ctaButton: 'Contáctanos',
  },
  docs: {
    metaTitle: 'Documentación — Humanly',
    eyebrow: 'Documentación',
    title: 'La documentación está en camino.',
    body: 'Estamos escribiendo guías para escritores, editores y autoalojamiento. Mientras tanto, el README cubre la instalación y el autodespliegue.',
    readme: 'Ver el README ↗',
  },
};

const fr: MarketingDict = {
  nav: {
    learnMore: 'En savoir plus',
    blog: 'Recherche',
    docs: 'Documentation',
    resources: 'Ressources',
    github: 'GitHub',
    help: 'Aide',
    about: 'À propos',
    logIn: 'Se connecter',
    signUp: "S'inscrire",
  },
  footer: {
    taglineLine1: 'Chaque écrit a une histoire.',
    taglineLine2: 'Vous pouvez désormais la prouver.',
    product: 'Produit',
    resources: 'Ressources',
    company: 'Entreprise',
    startWriting: 'Commencer à écrire',
    liveDemo: 'Démo en direct',
    github: 'GitHub',
    docs: 'Documentation',
    help: 'Aide',
    blog: 'Recherche',
    about: 'À propos',
    contact: 'Contact',
    privacy: 'Politique de confidentialité',
    terms: "Conditions d'utilisation",
    copyright: '© 2026 Humanly Lab. Tous droits réservés.',
  },
  home: {
    heroTitleLine1: 'Humanly est votre plateforme configurable et traçable',
    heroTitleLine2: "d'écriture collaborative humain-IA",
    heroSubtitlePre: 'Chaque écrit a une ',
    heroSubtitleStory: 'histoire',
    heroSubtitlePost: '. Vous pouvez désormais la prouver.',
    startWriting: 'Commencer à écrire',
    tryLiveDemo: 'Essayer la démo',
    statementTitlePre: "Est-ce vous qui l'avez écrit, ",
    statementTitleMuted: "ou l'IA ?",
    statementBody:
      "Les détecteurs d'IA estiment l'authenticité à partir du texte final. Humanly enregistre directement le processus d'écriture, montrant comment le texte a été composé entre frappe, collage et assistance IA.",
    tryItTitle: 'Comment fonctionne Humanly ?',
    tryItBody:
      "Configurez un environnement d'écriture, rédigez selon ses règles, enregistrez le journal d'activité et générez un certificat signé.",
    faqTitle: 'Questions fréquentes',
    faqs: [
      [
        'Pourquoi le texte final ne suffit-il pas ?',
        "Un document final ne peut pas montrer s'il provient d'une frappe humaine, d'une génération par IA ou d'une écriture mixte humain-IA. Humanly enregistre le processus d'écriture lui-même.",
      ],
      [
        "Qu'enregistre Humanly ?",
        "Humanly enregistre l'activité d'écriture sur la plateforme — modifications de texte, actions du presse-papiers, état de l'espace de travail et assistance IA — puis la transforme en journaux et en relecture.",
      ],
      [
        "Qui contrôle les règles d'écriture ?",
        "Le propriétaire configure l'environnement avant le début de la rédaction : accès à l'IA, règles de copier-coller, ressources, délais, limites de longueur et détecteurs.",
      ],
      [
        'Que montre un certificat ?',
        "Un certificat rassemble les statistiques d'auteur, les paramètres d'environnement, le journal d'activité, la relecture, l'examen des anomalies et la vérification de signature.",
      ],
      [
        'Comment Humanly aide-t-il à prévenir la triche ?',
        "Humanly utilise une détection d'anomalies à deux niveaux : des motifs statistiques et une détection de frappe humaine basée sur un modèle. Ces signaux mettent en évidence les comportements suspects pour examen, sans verdict automatique.",
      ],
    ],
    demoTitle: 'Démo Humanly',
    demoBody:
      "Voyez comment Humanly transforme l'écriture en preuve vérifiable.",
    openDemo: 'Ouvrir la démo',
  },
  about: {
    metaTitle: 'À propos — Humanly',
    eyebrow: 'À propos',
    heroTitle: "L'écriture mérite une histoire vérifiable.",
    heroBody:
      "Humanly Lab construit une infrastructure de provenance pour l'ère de l'écriture assistée par IA. Plutôt que de deviner si un texte final a été écrit par un humain, nous enregistrons le processus d'écriture lui-même — chaque frappe, collage et interaction avec l'IA — et le transformons en preuve vérifiable d'auteur.",
    researchTitle: 'Né de la recherche',
    researchBody:
      "Humanly a débuté comme un projet de recherche sur l'authenticité de l'écriture à l'ère des LLM, construit par des chercheurs d'UT Austin, de l'Université de Toronto, de Stanford, du MIT, d'USC et de KAUST. Notre premier article — présentant la plateforme et son approche de l'auteur fondée sur les trajectoires — est en cours d'évaluation à EMNLP 2026 System Demonstrations, et la plateforme est open source. Nous sommes une équipe fondée sur la recherche : le produit livre ce que la recherche valide.",
    beliefs: [
      [
        'La provenance plutôt que la détection',
        "Les détecteurs d'IA a posteriori devinent à partir du texte final et se trompent dans les deux sens. Enregistrer comment un texte a été écrit produit des preuves plutôt que des estimations.",
      ],
      [
        "La transparence plutôt que l'interdiction",
        "L'IA fait déjà partie de l'écriture. La réponse n'est pas de l'interdire, mais de rendre son rôle visible et configurable, pour que chaque contexte définisse ses propres règles.",
      ],
      [
        'La recherche en production',
        "Humanly est à la fois un produit et un instrument de recherche. La même infrastructure qui certifie l'écriture alimente nos études sur la façon dont les gens écrivent réellement avec l'IA.",
      ],
    ],
    teamTitle: 'Équipe',
    teamBody:
      "Des chercheurs de six institutions travaillant sur la provenance de l'écriture, la collaboration humain-IA et l'analyse comportementale.",
    ctaTitle: 'Découvrez la plateforme derrière la recherche',
    ctaDemo: 'Essayer la démo',
    ctaResearch: 'Lire nos recherches',
  },
  blog: {
    metaTitle: 'Recherche — Humanly',
    eyebrow: 'Recherche',
    heroTitle: 'Recherche',
    heroBody:
      "Humanly est autant une infrastructure de recherche qu'un produit.",
    publicationsTitle: 'Publications',
    underReview: 'En cours d’évaluation',
    venue: 'EMNLP 2026 System Demonstrations',
    paperSummary: 'Rapport technique Humanly',
    codeLink: 'Article',
    demoLink: 'Démo en direct',
    seriesNote:
      "C'est le premier article d'une série. Les travaux suivants fondés sur la plateforme sont en cours.",
    directionsTitle: 'Pistes que nous explorons',
    directions: [
      [
        "Détection comportementale de l'usage d'IA",
        "Les trajectoires d'écriture portent des signaux que le texte final n'a pas. Nous étudions comment le comportement de frappe distingue l'usage conforme d'IA sur la plateforme de l'usage dissimulé d'IA externe.",
      ],
      [
        "Normes de provenance pour l'écriture",
        "Qu'est-ce qui devrait compter comme preuve d'auteur ? Nous travaillons sur des formats de certificats, des signatures et des flux de vérification auxquels des tiers peuvent se fier sans nous faire confiance.",
      ],
      [
        'Collaboration humain-IA à grande échelle',
        "La plateforme enregistre comment les gens rédigent, révisent et délèguent réellement à l'IA. Ces données de processus permettent des études d'écriture collaborative impossibles à partir des seuls documents finaux.",
      ],
    ],
    ctaTitle: 'Envie de collaborer ?',
    ctaBody:
      "Nous travaillons avec des chercheurs, des enseignants et des institutions qui étudient l'authenticité de l'écriture humaine à l'ère de l'IA.",
    ctaButton: 'Nous contacter',
  },
  docs: {
    metaTitle: 'Documentation — Humanly',
    eyebrow: 'Documentation',
    title: 'La documentation arrive.',
    body: "Nous rédigeons des guides pour les auteurs, les éditeurs et l'auto-hébergement. En attendant, le README couvre l'installation et l'auto-déploiement.",
    readme: 'Voir le README ↗',
  },
};

const dictionaries: Record<MarketingLocale, MarketingDict> = {
  en,
  'zh-CN': zhCN,
  ja,
  es,
  fr,
};

export const getMarketingDict = (locale: MarketingLocale): MarketingDict =>
  dictionaries[locale];
