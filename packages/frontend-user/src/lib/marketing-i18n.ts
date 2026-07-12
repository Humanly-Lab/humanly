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
    learnMore: 'Product',
    blog: 'Research',
    docs: 'Docs',
    pricing: 'Pricing',
    resources: 'Resources',
    github: 'GitHub',
    help: 'Help',
    about: 'About Us',
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
    pricing: 'Pricing',
    github: 'GitHub',
    docs: 'Docs',
    help: 'Help',
    blog: 'Research',
    about: 'About Us',
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
    metaTitle: 'About Us — Humanly',
    metaDescription:
      'Humanly Lab studies how human authenticity, agency, and authorship can remain visible in the age of AI agents, then turns that research into practical systems.',
    heroTitle: 'Human authenticity in the age of AI agents',
    heroBody:
      'Humanly Lab studies how human agency, authorship, and responsibility remain visible when people work with AI. We turn that research into configurable, traceable, and verifiable systems.',
    philosophyTitle: 'Human authenticity is not the absence of AI.',
    philosophyBody:
      'It is the ability to understand how work was produced, what people contributed, and how AI participated.',
    principles: [
      [
        'Evidence over inference',
        'Outputs alone cannot reliably reveal how work was produced. We build systems that preserve process evidence instead of relying on post-hoc guesses.',
      ],
      [
        'Transparency over prohibition',
        'AI will be part of more creative and intellectual work. Its role should be visible and governed, not hidden or treated as automatically disqualifying.',
      ],
      [
        'Human agency at the center',
        "Technology should make people's decisions, revisions, and responsibility legible, even when AI contributes to the result.",
      ],
    ] as ReadonlyArray<readonly [string, string]>,
    whoTitle: 'Who we are',
    whoBody:
      'We are a research-led team working across UT Austin, University of Toronto, and Stanford University. We combine research and engineering to turn this mission into systems people can use.',
    teamTitle: 'Meet our Humanly Lab team',
    roleTeamLead: 'Team Lead',
    roleEngineer: 'Engineer',
  },
  blog: {
    metaTitle: 'Research — Humanly',
    metaDescription:
      'Research from Humanly Lab on writing provenance, human authenticity, and human-AI collaboration.',
    heroTitle: 'Research',
    heroBody:
      'Humanly is research infrastructure as much as product. We study how human authenticity can be understood and verified in the age of AI agents.',
    paperTag: 'Paper',
    blogTag: 'Blog',
    articleTitle: 'Beyond Post-hoc Detection',
    articleExcerpt:
      'Finished text can suggest that AI was involved. It cannot show how AI entered the writing process. Our 240-sample stress test shows why those are different questions.',
    articleMeta: 'Shenzhe Zhu · 8 min read',
    readArticle: 'Read article',
    articlePreviewTitle: 'Same output, different histories',
    articlePreviewMetric: 'Best policy accuracy',
    paperSummary: 'Humanly Tech Report',
    paperLink: 'Read paper',
    authorsNote: '* Equal contribution. † Corresponding author.',
    cite: 'Cite',
    ctaTitle: 'Interested in collaborating?',
    ctaBody:
      'We work with researchers, instructors, and institutions studying human writing authenticity in the age of AI.',
    ctaButton: 'Get in touch',
  },
  docs: {
    metaTitle: 'Docs — Humanly',
    metaDescription:
      'Guides for writers, publishers, and self-hosters of Humanly.',
    eyebrow: 'Docs',
    title: 'Documentation is on its way.',
    body: 'We are writing guides for writers, publishers, and self-hosters. In the meantime, the README covers setup and self-deployment.',
    readme: 'View the README ↗',
  },
  pricing: {
    metaTitle: 'Pricing — Humanly',
    metaDescription:
      'Compare Humanly Open Source, Free, Pro, and Enterprise options for personal writing, task assignment, and institutional deployment.',
    title: 'Pricing',
    subtitle:
      'Start free. Choose a managed workspace or run Humanly on your own infrastructure.',
    billingCycleLabel: 'Billing cycle',
    monthly: 'Monthly',
    yearly: 'Yearly',
    period: {
      monthly: '/ month',
      yearly: '/ year',
    },
    plans: {
      openSource: {
        name: 'Open Source',
        environment: 'Local',
        description:
          'Run the current open-source version of Humanly on your own infrastructure.',
        price: 'Free',
        features: [
          'Self-host on your infrastructure',
          'Source code and deployment tools',
          'Bring your own AI provider',
          'Community releases on GitHub',
        ],
        actionLabel: 'View on GitHub',
      },
      free: {
        name: 'Free',
        environment: 'SaaS',
        description:
          'For individuals who want a managed personal writing workspace.',
        price: '$0',
        features: [
          'Personal Writing',
          '100 included AI requests per account',
          'Up to 10 personal writing projects',
          'Activity logs, replay, and signed certificates',
        ],
        actionLabel: 'Get started',
      },
      pro: {
        name: 'Pro',
        environment: 'SaaS',
        description: 'For instructors managing writing assignments and writers.',
        price: 'Coming soon',
        features: [
          'Everything in Free',
          'Personal Writing and Task Assignment',
          'Writer and Publisher portals',
          '1,000 included AI requests per account',
          'Allocate AI requests across assignments',
          'Manage up to 100 assignments',
          'API access',
        ],
        actionLabel: 'Coming soon',
      },
      enterprise: {
        name: 'Enterprise',
        environment: 'SaaS or self-hosted',
        description:
          'For institutions that need tailored deployment, governance, and support.',
        price: 'Coming soon',
        features: [
          'Everything in Pro',
          'Managed or institution-ready self-hosting',
          'Custom usage and assignment limits',
          'Deployment support',
          'Custom integrations',
        ],
        actionLabel: 'Coming soon',
      },
    },
  },
};

export type MarketingDict = typeof en;

const zhCN: MarketingDict = {
  nav: {
    learnMore: '产品',
    blog: '研究',
    docs: '文档',
    pricing: '价格',
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
    pricing: '价格',
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
    metaDescription:
      'Humanly Lab 研究在 AI 智能体时代如何让人类真实性、能动性与作者身份保持可见，并将研究转化为实用系统。',
    heroTitle: 'AI 智能体时代的人类真实性',
    heroBody:
      'Humanly Lab 研究当人们与 AI 协作时，如何让人的能动性、作者身份与责任保持可见，并将研究转化为可配置、可追溯、可验证的实用系统。',
    philosophyTitle: '人类真实性并不意味着没有使用 AI。',
    philosophyBody:
      '它意味着我们能够理解一项工作如何形成、人贡献了什么，以及 AI 如何参与其中。',
    principles: [
      [
        '证据，而非推测',
        '最终结果无法可靠地说明工作如何完成。我们构建保留过程证据的系统，而不是依赖事后推测。',
      ],
      [
        '透明，而非禁止',
        'AI 将参与更多创造性与智力工作。它的作用应当可见、可治理，而不是被隐藏或自动视为不合格。',
      ],
      [
        '以人的能动性为中心',
        '即使 AI 参与了结果，技术也应让人的决策、修改与责任清晰可见。',
      ],
    ],
    whoTitle: '我们是谁',
    whoBody:
      '我们是一支研究驱动的团队，成员来自 UT Austin、多伦多大学与斯坦福大学。我们结合研究与工程，将这一使命转化为人们真正能够使用的系统。',
    teamTitle: '认识 Humanly Lab 团队',
    roleTeamLead: '团队负责人',
    roleEngineer: '工程师',
  },
  blog: {
    metaTitle: '研究 — Humanly',
    metaDescription:
      'Humanly Lab 关于写作溯源、人类真实性与人机协作的研究。',
    heroTitle: '研究',
    heroBody: 'Humanly 既是产品，也是研究基础设施。',
    paperTag: '论文',
    blogTag: '博客',
    articleTitle: 'Beyond Post-hoc Detection',
    articleExcerpt:
      '最终文本可以提示 AI 是否参与，却无法说明 AI 如何进入写作过程。我们的 240 个样本压力测试展示了这两个问题为何不同。',
    articleMeta: 'Shenzhe Zhu · 阅读约 8 分钟',
    readArticle: '阅读文章',
    articlePreviewTitle: '相同文本，不同过程',
    articlePreviewMetric: '最佳策略准确率',
    paperSummary: 'Humanly 技术报告',
    paperLink: '阅读论文',
    authorsNote: '* 同等贡献。† 通讯作者。',
    cite: '引用',
    ctaTitle: '有兴趣合作吗？',
    ctaBody: '我们与研究 AI 时代人类写作真实性的研究者、教师与机构合作。',
    ctaButton: '联系我们',
  },
  docs: {
    metaTitle: '文档 — Humanly',
    metaDescription: '面向写作者、发布者与自部署用户的 Humanly 指南。',
    eyebrow: '文档',
    title: '文档正在编写中。',
    body: '我们正在为写作者、发布者与自部署用户编写指南。在此之前，README 涵盖了安装与自部署说明。',
    readme: '查看 README ↗',
  },
  pricing: {
    metaTitle: '价格 — Humanly',
    metaDescription:
      '比较 Humanly 开源版、免费版、专业版与企业版在个人写作、任务分配和机构部署方面的方案。',
    title: '价格',
    subtitle: '免费开始。选择托管工作区，或在自有基础设施上运行 Humanly。',
    billingCycleLabel: '计费周期',
    monthly: '月付',
    yearly: '年付',
    period: {
      monthly: '/ 月',
      yearly: '/ 年',
    },
    plans: {
      openSource: {
        name: '开源版',
        environment: '本地部署',
        description: '在自有基础设施上运行当前的 Humanly 开源版本。',
        price: '免费',
        features: [
          '在自有基础设施上部署',
          '源代码与部署工具',
          '使用自己的 AI 服务商',
          '通过 GitHub 获取社区版本',
        ],
        actionLabel: '在 GitHub 查看',
      },
      free: {
        name: '免费版',
        environment: 'SaaS',
        description: '适合需要托管式个人写作空间的个人用户。',
        price: '$0',
        features: [
          '个人写作',
          '每个账户包含 100 次 AI 请求',
          '最多 10 个个人写作项目',
          '活动日志、轨迹回放与签名证书',
        ],
        actionLabel: '开始使用',
      },
      pro: {
        name: '专业版',
        environment: 'SaaS',
        description: '适合管理写作任务和写作者的教师。',
        price: '即将推出',
        features: [
          '包含免费版全部功能',
          '个人写作与任务分配',
          '写作者与发布者双门户',
          '每个账户包含 1,000 次 AI 请求',
          '可将 AI 请求额度分配给不同任务',
          '最多管理 100 个任务',
          'API 访问权限',
        ],
        actionLabel: '即将推出',
      },
      enterprise: {
        name: '企业版',
        environment: 'SaaS 或自部署',
        description: '适合需要定制部署、治理与支持的机构。',
        price: '即将推出',
        features: [
          '包含专业版全部功能',
          '托管部署或面向机构的自部署',
          '定制使用量与任务上限',
          '部署支持',
          '定制集成',
        ],
        actionLabel: '即将推出',
      },
    },
  },
};

const ja: MarketingDict = {
  nav: {
    learnMore: 'プロダクト',
    blog: '研究',
    docs: 'ドキュメント',
    pricing: '料金',
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
    pricing: '料金',
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
    metaDescription:
      'Humanly Lab は、AI エージェント時代に人間の真正性、主体性、著者性をどう可視化できるかを研究し、実用的なシステムへとつなげています。',
    heroTitle: 'AI エージェント時代の人間の真正性',
    heroBody:
      'Humanly Lab は、人が AI と協働するときにも、人間の主体性、著者性、責任をどう可視化できるかを研究し、その成果を設定可能・追跡可能・検証可能な実用システムへと変えます。',
    philosophyTitle: '人間の真正性とは、AI を使わないことではありません。',
    philosophyBody:
      '仕事がどのように作られ、人が何を担い、AI がどのように関与したかを理解できることです。',
    principles: [
      [
        '推測ではなく証拠',
        '最終的な成果物だけでは、それがどう作られたかを確かに示せません。私たちは、事後的な推測ではなく、過程の証拠を残すシステムを構築します。',
      ],
      [
        '禁止ではなく透明性',
        'AI はより多くの創造的・知的な仕事に関わります。その役割は隠されたり自動的に失格とされたりするのではなく、可視化され管理されるべきです。',
      ],
      [
        '人間の主体性を中心に',
        'AI が成果に関与していても、技術は人の意思決定、修正、責任を明確に示すべきです。',
      ],
    ],
    whoTitle: '私たちについて',
    whoBody:
      '私たちは UT Austin、トロント大学、スタンフォード大学を拠点とする研究主導のチームです。研究とエンジニアリングを組み合わせ、この使命を人々が実際に使えるシステムへと変えています。',
    teamTitle: 'Humanly Lab チームの紹介',
    roleTeamLead: 'チームリード',
    roleEngineer: 'エンジニア',
  },
  blog: {
    metaTitle: '研究 — Humanly',
    metaDescription:
      'Humanly Lab による、文章の来歴、人間の真正性、人間と AI の協働に関する研究。',
    heroTitle: '研究',
    heroBody: 'Humanly は製品であると同時に研究基盤です。',
    paperTag: '論文',
    blogTag: 'ブログ',
    articleTitle: 'Beyond Post-hoc Detection',
    articleExcerpt:
      '完成した文章から AI の関与を推測することはできても、AI が執筆過程にどう入ったかは分かりません。240 サンプルのストレステストで、その違いを検証しました。',
    articleMeta: 'Shenzhe Zhu · 8分で読めます',
    readArticle: '記事を読む',
    articlePreviewTitle: '同じ文章、異なる過程',
    articlePreviewMetric: '最高ポリシー精度',
    paperSummary: 'Humanly テクニカルレポート',
    paperLink: '論文を読む',
    authorsNote: '* 同等貢献。† 責任著者。',
    cite: '引用',
    ctaTitle: '共同研究に興味がありますか？',
    ctaBody:
      'AI 時代の人間による執筆の真正性を研究する研究者、教育者、機関と協力しています。',
    ctaButton: 'お問い合わせ',
  },
  docs: {
    metaTitle: 'ドキュメント — Humanly',
    metaDescription:
      'ライター、パブリッシャー、セルフホスト向けの Humanly ガイド。',
    eyebrow: 'ドキュメント',
    title: 'ドキュメントは準備中です。',
    body: 'ライター、パブリッシャー、セルフホスト向けのガイドを執筆中です。それまでは、README にセットアップとセルフデプロイの説明があります。',
    readme: 'README を見る ↗',
  },
  pricing: {
    metaTitle: '料金 — Humanly',
    metaDescription:
      '個人執筆、課題管理、組織導入に対応する Humanly のオープンソース、Free、Pro、Enterprise プランを比較できます。',
    title: '料金',
    subtitle:
      '無料で始めましょう。マネージド環境を選ぶか、ご自身のインフラで Humanly を実行できます。',
    billingCycleLabel: '請求サイクル',
    monthly: '月払い',
    yearly: '年払い',
    period: {
      monthly: '/ 月',
      yearly: '/ 年',
    },
    plans: {
      openSource: {
        name: 'オープンソース',
        environment: 'ローカル',
        description:
          '現在の Humanly オープンソース版を独自インフラで実行できます。',
        price: '無料',
        features: [
          '独自インフラでセルフホスト',
          'ソースコードとデプロイツール',
          '任意の AI プロバイダーを利用',
          'GitHub でコミュニティリリースを提供',
        ],
        actionLabel: 'GitHub で見る',
      },
      free: {
        name: 'Free',
        environment: 'SaaS',
        description: 'マネージドな個人執筆環境を求める方向けです。',
        price: '$0',
        features: [
          '個人執筆',
          'アカウントごとに AI リクエスト 100 回',
          '個人執筆プロジェクト最大 10 件',
          'アクティビティログ、リプレイ、署名付き証明書',
        ],
        actionLabel: '始める',
      },
      pro: {
        name: 'Pro',
        environment: 'SaaS',
        description: '執筆課題とライターを管理する教育者向けです。',
        price: '近日公開',
        features: [
          'Free の全機能',
          '個人執筆と課題管理',
          'ライターおよびパブリッシャーポータル',
          'アカウントごとに AI リクエスト 1,000 回',
          '課題ごとに AI リクエストを配分',
          '課題を最大 100 件管理',
          'API アクセス',
        ],
        actionLabel: '近日公開',
      },
      enterprise: {
        name: 'Enterprise',
        environment: 'SaaS またはセルフホスト',
        description:
          'カスタム導入、ガバナンス、サポートが必要な組織向けです。',
        price: '近日公開',
        features: [
          'Pro の全機能',
          'マネージド導入または組織向けセルフホスト',
          '利用量と課題上限のカスタマイズ',
          '導入支援',
          'カスタム連携',
        ],
        actionLabel: '近日公開',
      },
    },
  },
};

const es: MarketingDict = {
  nav: {
    learnMore: 'Producto',
    blog: 'Investigación',
    docs: 'Documentación',
    pricing: 'Precios',
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
    pricing: 'Precios',
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
    metaDescription:
      'Humanly Lab estudia cómo mantener visibles la autenticidad, la agencia y la autoría humanas en la era de los agentes de IA, y convierte esa investigación en sistemas prácticos.',
    heroTitle: 'La autenticidad humana en la era de los agentes de IA',
    heroBody:
      'Humanly Lab estudia cómo mantener visibles la agencia, la autoría y la responsabilidad humanas al trabajar con IA. Convertimos esa investigación en sistemas configurables, trazables y verificables.',
    philosophyTitle: 'La autenticidad humana no significa ausencia de IA.',
    philosophyBody:
      'Es la capacidad de entender cómo se produjo un trabajo, qué aportaron las personas y cómo participó la IA.',
    principles: [
      [
        'Evidencia en lugar de inferencia',
        'Los resultados por sí solos no pueden revelar de forma fiable cómo se produjo el trabajo. Construimos sistemas que conservan evidencia del proceso en lugar de depender de conjeturas posteriores.',
      ],
      [
        'Transparencia en lugar de prohibición',
        'La IA formará parte de más trabajo creativo e intelectual. Su papel debe ser visible y gobernable, no oculto ni tratado automáticamente como descalificador.',
      ],
      [
        'La agencia humana en el centro',
        'La tecnología debe hacer legibles las decisiones, revisiones y responsabilidades de las personas, incluso cuando la IA contribuye al resultado.',
      ],
    ],
    whoTitle: 'Quiénes somos',
    whoBody:
      'Somos un equipo guiado por la investigación que trabaja entre UT Austin, la Universidad de Toronto y la Universidad de Stanford. Combinamos investigación e ingeniería para convertir esta misión en sistemas que las personas puedan usar.',
    teamTitle: 'Conoce al equipo de Humanly Lab',
    roleTeamLead: 'Líder del equipo',
    roleEngineer: 'Ingeniero',
  },
  blog: {
    metaTitle: 'Investigación — Humanly',
    metaDescription:
      'Investigación de Humanly Lab sobre procedencia de la escritura, autenticidad humana y colaboración entre personas e IA.',
    heroTitle: 'Investigación',
    heroBody:
      'Humanly es tanto infraestructura de investigación como producto.',
    paperTag: 'Artículo',
    blogTag: 'Blog',
    articleTitle: 'Beyond Post-hoc Detection',
    articleExcerpt:
      'El texto final puede sugerir que intervino la IA, pero no muestra cómo entró en el proceso de escritura. Nuestro estudio de 240 muestras explica por qué son preguntas distintas.',
    articleMeta: 'Shenzhe Zhu · 8 min de lectura',
    readArticle: 'Leer artículo',
    articlePreviewTitle: 'Mismo resultado, historias distintas',
    articlePreviewMetric: 'Mejor precisión de política',
    paperSummary: 'Informe técnico de Humanly',
    paperLink: 'Leer artículo',
    authorsNote: '* Contribución equitativa. † Autor de correspondencia.',
    cite: 'Citar',
    ctaTitle: '¿Interesado en colaborar?',
    ctaBody:
      'Trabajamos con investigadores, docentes e instituciones que estudian la autenticidad de la escritura humana en la era de la IA.',
    ctaButton: 'Contáctanos',
  },
  docs: {
    metaTitle: 'Documentación — Humanly',
    metaDescription:
      'Guías de Humanly para escritores, editores y autoalojamiento.',
    eyebrow: 'Documentación',
    title: 'La documentación está en camino.',
    body: 'Estamos escribiendo guías para escritores, editores y autoalojamiento. Mientras tanto, el README cubre la instalación y el autodespliegue.',
    readme: 'Ver el README ↗',
  },
  pricing: {
    metaTitle: 'Precios — Humanly',
    metaDescription:
      'Compara las opciones Open Source, Free, Pro y Enterprise de Humanly para escritura personal, asignación de tareas y despliegues institucionales.',
    title: 'Precios',
    subtitle:
      'Empieza gratis. Elige un espacio gestionado o ejecuta Humanly en tu propia infraestructura.',
    billingCycleLabel: 'Ciclo de facturación',
    monthly: 'Mensual',
    yearly: 'Anual',
    period: {
      monthly: '/ mes',
      yearly: '/ año',
    },
    plans: {
      openSource: {
        name: 'Código abierto',
        environment: 'Local',
        description:
          'Ejecuta la versión actual de código abierto de Humanly en tu propia infraestructura.',
        price: 'Gratis',
        features: [
          'Autoalojamiento en tu infraestructura',
          'Código fuente y herramientas de despliegue',
          'Tu propio proveedor de IA',
          'Versiones de la comunidad en GitHub',
        ],
        actionLabel: 'Ver en GitHub',
      },
      free: {
        name: 'Free',
        environment: 'SaaS',
        description:
          'Para personas que quieren un espacio gestionado de escritura personal.',
        price: '$0',
        features: [
          'Escritura personal',
          '100 solicitudes de IA incluidas por cuenta',
          'Hasta 10 proyectos de escritura personal',
          'Registros de actividad, reproducción y certificados firmados',
        ],
        actionLabel: 'Empezar',
      },
      pro: {
        name: 'Pro',
        environment: 'SaaS',
        description:
          'Para docentes que gestionan tareas de escritura y escritores.',
        price: 'Próximamente',
        features: [
          'Todo lo incluido en Free',
          'Escritura personal y asignación de tareas',
          'Portales para escritores y publicadores',
          '1.000 solicitudes de IA incluidas por cuenta',
          'Distribución de solicitudes de IA entre tareas',
          'Gestión de hasta 100 tareas',
          'Acceso a la API',
        ],
        actionLabel: 'Próximamente',
      },
      enterprise: {
        name: 'Enterprise',
        environment: 'SaaS o autoalojado',
        description:
          'Para instituciones que necesitan despliegue, gobernanza y soporte a medida.',
        price: 'Próximamente',
        features: [
          'Todo lo incluido en Pro',
          'Despliegue gestionado o autoalojamiento institucional',
          'Límites de uso y tareas personalizados',
          'Soporte de despliegue',
          'Integraciones personalizadas',
        ],
        actionLabel: 'Próximamente',
      },
    },
  },
};

const fr: MarketingDict = {
  nav: {
    learnMore: 'Produit',
    blog: 'Recherche',
    docs: 'Documentation',
    pricing: 'Tarifs',
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
    pricing: 'Tarifs',
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
    metaDescription:
      "Humanly Lab étudie comment préserver la visibilité de l'authenticité, de l'action et de la paternité humaines à l'ère des agents d'IA, puis transforme cette recherche en systèmes concrets.",
    heroTitle: "L'authenticité humaine à l'ère des agents d'IA",
    heroBody:
      "Humanly Lab étudie comment préserver la visibilité de l'action, de la paternité et de la responsabilité humaines dans le travail avec l'IA. Nous transformons cette recherche en systèmes configurables, traçables et vérifiables.",
    philosophyTitle: "L'authenticité humaine ne signifie pas l'absence d'IA.",
    philosophyBody:
      "C'est la capacité de comprendre comment un travail a été produit, ce que les personnes ont apporté et comment l'IA y a participé.",
    principles: [
      [
        "La preuve plutôt que l'inférence",
        "Les résultats seuls ne peuvent pas révéler de manière fiable comment un travail a été produit. Nous construisons des systèmes qui conservent les preuves du processus plutôt que de dépendre d'hypothèses a posteriori.",
      ],
      [
        "La transparence plutôt que l'interdiction",
        "L'IA participera à davantage de travaux créatifs et intellectuels. Son rôle doit être visible et gouverné, non caché ou considéré automatiquement comme disqualifiant.",
      ],
      [
        "L'action humaine au centre",
        "La technologie doit rendre lisibles les décisions, les révisions et la responsabilité des personnes, même lorsque l'IA contribue au résultat.",
      ],
    ],
    whoTitle: 'Qui nous sommes',
    whoBody:
      "Nous sommes une équipe portée par la recherche, active entre UT Austin, l'Université de Toronto et l'Université Stanford. Nous combinons recherche et ingénierie pour transformer cette mission en systèmes que chacun peut utiliser.",
    teamTitle: "L'équipe de Humanly Lab",
    roleTeamLead: "Responsable d'équipe",
    roleEngineer: 'Ingénieur',
  },
  blog: {
    metaTitle: 'Recherche — Humanly',
    metaDescription:
      "Les recherches de Humanly Lab sur la provenance de l'écriture, l'authenticité humaine et la collaboration humain-IA.",
    heroTitle: 'Recherche',
    heroBody:
      "Humanly est autant une infrastructure de recherche qu'un produit.",
    paperTag: 'Article',
    blogTag: 'Blog',
    articleTitle: 'Beyond Post-hoc Detection',
    articleExcerpt:
      "Le texte final peut suggérer qu'une IA est intervenue, mais il ne montre pas comment elle est entrée dans le processus d'écriture. Notre test de 240 échantillons montre pourquoi ces questions diffèrent.",
    articleMeta: 'Shenzhe Zhu · 8 min de lecture',
    readArticle: "Lire l'article",
    articlePreviewTitle: 'Même résultat, histoires différentes',
    articlePreviewMetric: 'Meilleure précision de politique',
    paperSummary: 'Rapport technique Humanly',
    paperLink: "Lire l'article",
    authorsNote: '* Contribution égale. † Auteur correspondant.',
    cite: 'Citer',
    ctaTitle: 'Envie de collaborer ?',
    ctaBody:
      "Nous travaillons avec des chercheurs, des enseignants et des institutions qui étudient l'authenticité de l'écriture humaine à l'ère de l'IA.",
    ctaButton: 'Nous contacter',
  },
  docs: {
    metaTitle: 'Documentation — Humanly',
    metaDescription:
      "Guides Humanly pour les auteurs, les éditeurs et l'auto-hébergement.",
    eyebrow: 'Documentation',
    title: 'La documentation arrive.',
    body: "Nous rédigeons des guides pour les auteurs, les éditeurs et l'auto-hébergement. En attendant, le README couvre l'installation et l'auto-déploiement.",
    readme: 'Voir le README ↗',
  },
  pricing: {
    metaTitle: 'Tarifs — Humanly',
    metaDescription:
      "Comparez les offres Open Source, Free, Pro et Enterprise de Humanly pour l'écriture personnelle, l'attribution de tâches et les déploiements institutionnels.",
    title: 'Tarifs',
    subtitle:
      'Commencez gratuitement. Choisissez un espace géré ou exécutez Humanly sur votre propre infrastructure.',
    billingCycleLabel: 'Cycle de facturation',
    monthly: 'Mensuel',
    yearly: 'Annuel',
    period: {
      monthly: '/ mois',
      yearly: '/ an',
    },
    plans: {
      openSource: {
        name: 'Open Source',
        environment: 'Local',
        description:
          'Exécutez la version open source actuelle de Humanly sur votre propre infrastructure.',
        price: 'Gratuit',
        features: [
          'Auto-hébergement sur votre infrastructure',
          'Code source et outils de déploiement',
          "Votre propre fournisseur d'IA",
          'Versions communautaires sur GitHub',
        ],
        actionLabel: 'Voir sur GitHub',
      },
      free: {
        name: 'Free',
        environment: 'SaaS',
        description:
          "Pour les personnes qui souhaitent un espace géré d'écriture personnelle.",
        price: '$0',
        features: [
          'Écriture personnelle',
          "100 requêtes d'IA incluses par compte",
          "Jusqu'à 10 projets d'écriture personnelle",
          "Journaux d'activité, replay et certificats signés",
        ],
        actionLabel: 'Commencer',
      },
      pro: {
        name: 'Pro',
        environment: 'SaaS',
        description:
          "Pour les enseignants qui gèrent des travaux d'écriture et leurs auteurs.",
        price: 'Bientôt disponible',
        features: [
          'Toutes les fonctionnalités de Free',
          'Écriture personnelle et attribution de tâches',
          'Portails Auteur et Éditeur',
          "1 000 requêtes d'IA incluses par compte",
          "Répartition des requêtes d'IA entre les tâches",
          "Gestion de jusqu'à 100 tâches",
          "Accès à l'API",
        ],
        actionLabel: 'Bientôt disponible',
      },
      enterprise: {
        name: 'Enterprise',
        environment: 'SaaS ou auto-hébergé',
        description:
          "Pour les institutions qui ont besoin d'un déploiement, d'une gouvernance et d'un accompagnement sur mesure.",
        price: 'Bientôt disponible',
        features: [
          'Toutes les fonctionnalités de Pro',
          'Déploiement géré ou auto-hébergement institutionnel',
          "Limites d'utilisation et de tâches personnalisées",
          'Accompagnement au déploiement',
          'Intégrations personnalisées',
        ],
        actionLabel: 'Bientôt disponible',
      },
    },
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
