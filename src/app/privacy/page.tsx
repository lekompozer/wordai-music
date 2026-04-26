import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Privacy Policy | WynAI Music',
    description: 'Privacy Policy for WynAI Music in Vietnamese and English.',
};

const viSections = [
    {
        title: '1. Phạm vi áp dụng',
        body: [
            'Chính sách này áp dụng cho ứng dụng WynAI Music trên desktop, web và các nền tảng phân phối liên quan.',
            'Khi bạn sử dụng ứng dụng, đăng nhập, lưu playlist, nhập đường link hoặc cung cấp dữ liệu cho hệ thống, bạn đồng ý với chính sách này.',
        ],
    },
    {
        title: '2. Dữ liệu chúng tôi có thể thu thập',
        body: [
            'Thông tin tài khoản: email, tên hiển thị, mã định danh người dùng và trạng thái xác thực.',
            'Dữ liệu sử dụng: playlist, lịch sử phát, tùy chọn giao diện, cài đặt ngôn ngữ, dữ liệu bộ nhớ đệm, thông tin thiết bị và log kỹ thuật cần thiết cho hoạt động của ứng dụng.',
            'Dữ liệu người dùng cung cấp: đường link, metadata, tiêu đề nội dung, nguồn phát hoặc dữ liệu khác mà bạn chủ động thêm vào ứng dụng.',
        ],
    },
    {
        title: '3. Mục đích sử dụng dữ liệu',
        body: [
            'Cung cấp tính năng phát nhạc, quản lý playlist, đồng bộ tài khoản, lưu trạng thái phát và cải thiện trải nghiệm nghe trên các thiết bị hỗ trợ.',
            'Bảo vệ hệ thống, phát hiện lỗi, ngăn chặn lạm dụng và đáp ứng nghĩa vụ pháp lý hoặc yêu cầu từ các store và nền tảng phân phối.',
        ],
    },
    {
        title: '4. Dịch vụ bên thứ ba',
        body: [
            'Ứng dụng có thể sử dụng dịch vụ bên thứ ba như Firebase, hạ tầng lưu trữ, analytics hoặc các nhà cung cấp nội dung liên quan để hỗ trợ một số tính năng.',
            'Các nhà cung cấp đó chỉ xử lý dữ liệu trong phạm vi cần thiết để cung cấp dịch vụ tương ứng.',
        ],
    },
    {
        title: '5. Bản quyền nội dung và quyền gỡ bỏ',
        body: [
            'Người dùng chịu trách nhiệm bảo đảm rằng mọi đường link, nguồn phát, playlist, metadata hoặc dữ liệu khác mà mình thêm vào ứng dụng đều hợp pháp và có quyền sử dụng.',
            'Mọi dữ liệu người dùng phải tuân thủ luật bản quyền, giấy phép nội dung, điều khoản của nền tảng nguồn và quy định pháp luật hiện hành.',
            'Chúng tôi có quyền xóa, ẩn, vô hiệu hóa, chặn truy cập hoặc gỡ bỏ bất kỳ link, dữ liệu, playlist hoặc nội dung nào bị nghi ngờ vi phạm bản quyền, vi phạm giấy phép, vi phạm điều khoản sử dụng hoặc tạo rủi ro pháp lý, mà không cần thông báo trước.',
            'Chúng tôi có thể thực hiện việc này để đáp ứng yêu cầu của chủ sở hữu quyền, cơ quan có thẩm quyền, nhà cung cấp hạ tầng hoặc điều kiện của app store.',
        ],
    },
    {
        title: '6. Lưu trữ và bảo mật',
        body: [
            'Dữ liệu có thể được lưu cục bộ trên thiết bị hoặc trên hạ tầng dịch vụ để duy trì trải nghiệm nghe, bộ nhớ đệm và trạng thái tài khoản.',
            'Chúng tôi áp dụng biện pháp kỹ thuật hợp lý để bảo vệ dữ liệu, nhưng không có hệ thống nào an toàn tuyệt đối.',
        ],
    },
    {
        title: '7. Liên hệ',
        body: [
            'Nếu bạn có câu hỏi về quyền riêng tư, nội dung bản quyền hoặc yêu cầu gỡ bỏ, vui lòng liên hệ: hello@wynai.pro',
        ],
    },
];

const enSections = [
    {
        title: '1. Scope',
        body: [
            'This policy applies to the WynAI Music app on desktop, web, and related distribution platforms.',
            'By using the app, signing in, saving playlists, importing links, or providing data to the service, you agree to this policy.',
        ],
    },
    {
        title: '2. Data We May Collect',
        body: [
            'Account information such as email address, display name, user identifier, and authentication status.',
            'Usage data such as playlists, playback history, interface preferences, language settings, cached data, device information, and technical logs needed to operate the app.',
            'User-provided data such as links, metadata, track titles, content sources, and other information you choose to add to the app.',
        ],
    },
    {
        title: '3. How We Use Data',
        body: [
            'To provide music playback features, manage playlists, sync account state, remember playback progress, and improve the listening experience across supported devices.',
            'To protect the service, diagnose problems, prevent abuse, and comply with legal or store requirements.',
        ],
    },
    {
        title: '4. Third-Party Services',
        body: [
            'The app may use third-party services such as Firebase, storage providers, analytics tools, or related content providers to support certain features.',
            'Those providers may process data only as necessary to provide the relevant service.',
        ],
    },
    {
        title: '5. Copyright Compliance and Takedown Rights',
        body: [
            'Users are responsible for ensuring that any links, sources, playlists, metadata, or other content added to the app are lawful and properly licensed.',
            'All user data and submitted content must comply with copyright law, content licenses, source platform terms, and applicable regulations.',
            'We may remove, hide, disable access to, block, or delete any link, data, playlist, or content suspected of infringing copyright, violating licensing terms, breaching platform rules, or creating legal risk, without prior notice.',
            'We may take these actions to comply with requests from rights holders, legal authorities, infrastructure providers, or app store requirements.',
        ],
    },
    {
        title: '6. Storage and Security',
        body: [
            'Data may be stored locally on your device or on service infrastructure to preserve playback experience, caching, and account state.',
            'We use reasonable technical measures to protect data, but no system can guarantee absolute security.',
        ],
    },
    {
        title: '7. Contact',
        body: [
            'For privacy, copyright, or takedown questions, contact: hello@wynai.pro',
        ],
    },
];

function SectionList({ sections }: { sections: { title: string; body: string[] }[] }) {
    return (
        <div className="space-y-6">
            {sections.map((section) => (
                <section key={section.title} className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
                    <h2 className="text-xl font-bold text-white">{section.title}</h2>
                    <div className="mt-3 space-y-3 text-sm leading-7 text-gray-300">
                        {section.body.map((paragraph) => (
                            <p key={paragraph}>{paragraph}</p>
                        ))}
                    </div>
                </section>
            ))}
        </div>
    );
}

export default function PrivacyPolicyPage() {
    return (
        <main className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(251,191,36,0.14),transparent_28%),linear-gradient(180deg,#04030a_0%,#0b0714_44%,#0a0b14_100%)] text-white">
            <div className="mx-auto max-w-6xl px-6 py-16">
                <div className="rounded-[32px] border border-white/10 bg-black/30 p-8 shadow-[0_20px_80px_rgba(0,0,0,0.35)] backdrop-blur-xl md:p-10">
                    <div className="max-w-3xl">
                        <div className="inline-flex rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.24em] text-amber-200">
                            Privacy Policy
                        </div>
                        <h1 className="mt-5 text-4xl font-black tracking-tight text-white md:text-5xl">WynAI Music</h1>
                        <p className="mt-4 text-base leading-7 text-gray-300">
                            Chính sách quyền riêng tư song ngữ cho ứng dụng WynAI Music, dùng cho public website, app store submission và yêu cầu pháp lý khi phân phối sản phẩm.
                        </p>
                        <p className="mt-3 text-base leading-7 text-gray-400">
                            This bilingual privacy policy is designed for public hosting, store submission, and distribution compliance.
                        </p>
                        <p className="mt-6 text-sm text-gray-500">Effective date: April 26, 2026</p>
                    </div>
                </div>

                <div className="mt-10 grid gap-8 lg:grid-cols-2">
                    <div>
                        <div className="mb-4 text-sm font-bold uppercase tracking-[0.22em] text-amber-200">Tiếng Việt</div>
                        <SectionList sections={viSections} />
                    </div>
                    <div>
                        <div className="mb-4 text-sm font-bold uppercase tracking-[0.22em] text-orange-200">English</div>
                        <SectionList sections={enSections} />
                    </div>
                </div>
            </div>
        </main>
    );
}