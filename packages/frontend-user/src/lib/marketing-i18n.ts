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
    pricing: 'Pricing',
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
    pricing: 'Pricing',
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
    metaDescription:
      'Humanly Lab is a research-led team from UT Austin, University of Toronto, and Stanford building configurable, traceable infrastructure for human-AI writing.',
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
      'Researchers working on writing provenance, human-AI collaboration, and behavioral analysis.',
    roleTeamLead: 'Team Lead',
    roleEngineer: 'Engineer',
  },
  blog: {
    metaTitle: 'Research — Humanly',
    metaDescription:
      'Humanly is research infrastructure as much as product. Read the Humanly technical report on configurable, traceable human-AI collaborative writing.',
    heroTitle: 'Research',
    heroBody:
      'Humanly is research infrastructure as much as product. We study how human authenticity can be understood and verified in the age of AI agents.',
    paperSummary: 'Humanly Tech Report',
    codeLink: 'Paper',
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
          'Run the current Humanly research release on your own infrastructure.',
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
    learnMore: '了解更多',
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
      'Humanly Lab 是来自 UT Austin、多伦多大学与斯坦福的研究型团队，为人机协作写作构建可配置、可追溯的基础设施。',
    heroTitle: '让人机协作写作可配置、可追溯',
    heroBody:
      'Humanly 是一个可配置的写作平台，记录文档的创作过程——包括人工编辑与 AI 协助——并将其转化为活动日志和带签名的证书。',
    researchTitle: '我们是谁',
    researchBody:
      'Humanly Lab 是一支研究驱动的团队，为 AI 时代的写作构建实用的基础设施。Humanly 始于一个研究项目，正在成长为面向所有人的产品。我们的成员来自 UT Austin、多伦多大学与斯坦福大学。',
    beliefs: [
      [
        '我们在做什么',
        '一个端到端、可配置、可追溯的人机协作写作环境，同时提供自部署的本地方案与托管的 SaaS 产品。',
      ],
      [
        '为什么重要',
        '成稿无法说明它是如何产生的。Humanly 保留写作过程，让教师、研究者与读者审阅证据，而不是对着结果猜测。',
      ],
      [
        '如何获取 Humanly',
        'Humanly 提供托管 SaaS 产品与面向机构的自部署方案。当前研究版本完全开源。未来的商业形态可能包括企业授权、部署支持与定制集成。',
      ],
    ],
    teamTitle: '认识 Humanly 团队',
    teamBody: '专注写作溯源、人机协作与行为分析的研究者。',
    roleTeamLead: '团队负责人',
    roleEngineer: '工程师',
  },
  blog: {
    metaTitle: '研究 — Humanly',
    metaDescription:
      'Humanly 既是产品，也是研究基础设施。阅读 Humanly 技术报告，了解可配置、可追溯的人机协作写作。',
    heroTitle: '研究',
    heroBody: 'Humanly 既是产品，也是研究基础设施。',
    paperSummary: 'Humanly 技术报告',
    codeLink: '论文',
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
        description: '在自有基础设施上运行当前 Humanly 研究版本。',
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
    learnMore: '詳しく見る',
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
      'Humanly Lab は UT Austin、トロント大学、スタンフォードの研究主導チーム。人間と AI の執筆のための設定可能で追跡可能な基盤を構築しています。',
    heroTitle: '人間と AI の執筆を、設定可能で追跡可能に',
    heroBody:
      'Humanly は、人間による編集と AI 支援を含む文書の作成過程を記録する、設定可能な執筆プラットフォームです。その過程を活動ログと署名付き証明書に変換します。',
    researchTitle: '私たちについて',
    researchBody:
      'Humanly Lab は、AI 時代の執筆のための実用的な基盤を構築する研究主導のチームです。Humanly は研究プロジェクトとして始まり、誰もが使える製品へと成長しています。UT Austin、トロント大学、スタンフォード大学を拠点に活動しています。',
    beliefs: [
      [
        '何を作っているか',
        'エンドツーエンドで設定可能・追跡可能な、人間と AI の共同執筆環境。セルフホストのローカル展開と、マネージド SaaS 製品の両方で提供します。',
      ],
      [
        'なぜ重要か',
        '完成した文章は、それがどう作られたかを示せません。Humanly は過程を保存し、教員・研究者・読者が結果から推測するのではなく、証拠を確認できるようにします。',
      ],
      [
        '提供形態',
        'Humanly はマネージド SaaS 製品と、機関向けのセルフホスト展開で利用できます。現在の研究リリースはオープンソースです。将来的には、エンタープライズライセンス、導入支援、カスタム統合などの商用提供も検討しています。',
      ],
    ],
    teamTitle: 'Humanly チームの紹介',
    teamBody:
      '執筆の来歴、人間と AI の協働、行動分析に取り組む研究者たち。',
    roleTeamLead: 'チームリード',
    roleEngineer: 'エンジニア',
  },
  blog: {
    metaTitle: '研究 — Humanly',
    metaDescription:
      'Humanly は製品であると同時に研究基盤です。Humanly テクニカルレポートをご覧ください。',
    heroTitle: '研究',
    heroBody: 'Humanly は製品であると同時に研究基盤です。',
    paperSummary: 'Humanly テクニカルレポート',
    codeLink: '論文',
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
          '現在の Humanly 研究リリースを独自インフラで実行できます。',
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
    learnMore: 'Saber más',
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
      'Humanly Lab es un equipo de investigación de UT Austin, la Universidad de Toronto y Stanford que construye infraestructura configurable y trazable para la escritura humano-IA.',
    heroTitle: 'Escritura humano-IA configurable y trazable',
    heroBody:
      'Humanly es una plataforma de escritura configurable que registra cómo se crea un documento, incluida la edición humana y la asistencia de IA, y convierte ese proceso en un registro de actividad y un certificado firmado.',
    researchTitle: 'Quiénes somos',
    researchBody:
      'Humanly Lab es un equipo liderado por la investigación que construye infraestructura práctica para escribir en la era de la IA. Humanly comenzó como un proyecto de investigación y se está convirtiendo en un producto para todos. Trabajamos entre UT Austin, la Universidad de Toronto y la Universidad de Stanford.',
    beliefs: [
      [
        'Qué construimos',
        'Un entorno integral, configurable y trazable para la escritura colaborativa humano-IA, disponible como despliegue local autoalojado y como producto SaaS gestionado.',
      ],
      [
        'Por qué importa',
        'El texto final no puede mostrar cómo se produjo. Humanly preserva el proceso para que docentes, investigadores y lectores revisen evidencia en lugar de adivinar a partir del resultado.',
      ],
      [
        'Cómo obtener Humanly',
        'Humanly está disponible como producto SaaS gestionado y como despliegue autoalojado para instituciones. La versión de investigación actual es de código abierto. Las futuras ofertas comerciales pueden incluir licencias empresariales, soporte de despliegue e integraciones a medida.',
      ],
    ],
    teamTitle: 'Conoce al equipo de Humanly',
    teamBody:
      'Investigadores dedicados a la procedencia de la escritura, la colaboración humano-IA y el análisis de comportamiento.',
    roleTeamLead: 'Líder del equipo',
    roleEngineer: 'Ingeniero',
  },
  blog: {
    metaTitle: 'Investigación — Humanly',
    metaDescription:
      'Humanly es tanto infraestructura de investigación como producto. Lee el informe técnico de Humanly.',
    heroTitle: 'Investigación',
    heroBody:
      'Humanly es tanto infraestructura de investigación como producto.',
    paperSummary: 'Informe técnico de Humanly',
    codeLink: 'Artículo',
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
          'Ejecuta la versión de investigación actual de Humanly en tu propia infraestructura.',
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
    learnMore: 'En savoir plus',
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
      "Humanly Lab est une équipe de recherche d'UT Austin, de l'Université de Toronto et de Stanford qui construit une infrastructure configurable et traçable pour l'écriture humain-IA.",
    heroTitle: "Rendre l'écriture humain-IA configurable et traçable",
    heroBody:
      "Humanly est une plateforme d'écriture configurable qui enregistre la création d'un document, y compris l'édition humaine et l'assistance IA, puis transforme ce processus en journal d'activité et en certificat signé.",
    researchTitle: 'Qui nous sommes',
    researchBody:
      "Humanly Lab est une équipe portée par la recherche qui construit une infrastructure concrète pour l'écriture à l'ère de l'IA. Humanly a débuté comme projet de recherche et devient un produit pour tous. Nous travaillons entre UT Austin, l'Université de Toronto et l'Université Stanford.",
    beliefs: [
      [
        'Ce que nous construisons',
        "Un environnement complet, configurable et traçable pour l'écriture collaborative humain-IA, disponible en déploiement local auto-hébergé comme en produit SaaS géré.",
      ],
      [
        "Pourquoi c'est important",
        'Le texte final ne peut pas montrer comment il a été produit. Humanly préserve le processus pour que les enseignants, chercheurs et lecteurs examinent des preuves au lieu de deviner à partir du résultat.',
      ],
      [
        'Comment obtenir Humanly',
        "Humanly est disponible en produit SaaS géré et en déploiement auto-hébergé pour les institutions. La version de recherche actuelle est open source. Les offres commerciales futures pourront inclure des licences entreprise, un accompagnement au déploiement et des intégrations sur mesure.",
      ],
    ],
    teamTitle: "L'équipe Humanly",
    teamBody:
      "Des chercheurs travaillant sur la provenance de l'écriture, la collaboration humain-IA et l'analyse comportementale.",
    roleTeamLead: "Responsable d'équipe",
    roleEngineer: 'Ingénieur',
  },
  blog: {
    metaTitle: 'Recherche — Humanly',
    metaDescription:
      "Humanly est autant une infrastructure de recherche qu'un produit. Lisez le rapport technique Humanly.",
    heroTitle: 'Recherche',
    heroBody:
      "Humanly est autant une infrastructure de recherche qu'un produit.",
    paperSummary: 'Rapport technique Humanly',
    codeLink: 'Article',
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
          'Exécutez la version de recherche actuelle de Humanly sur votre propre infrastructure.',
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
