Shader "Survival/WarmSky"
{
    Properties
    {
        _Top ("Top", Color) = (0.20, 0.40, 0.68, 1)
        _Hor ("Horizon", Color) = (0.58, 0.66, 0.74, 1)
        _Bot ("Below", Color) = (0.40, 0.38, 0.32, 1)
        _SunCol ("Sun", Color) = (1, 0.95, 0.82, 1)
        _SunDir ("SunDir", Vector) = (0.4, 0.5, 0.45, 0)
    }
    SubShader
    {
        Tags { "Queue"="Background" "RenderType"="Background" "PreviewType"="Skybox" "RenderPipeline"="UniversalPipeline" }
        Cull Off
        ZWrite Off
        Pass
        {
            HLSLPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"

            float4 _Top, _Hor, _Bot, _SunCol, _SunDir;

            struct Attributes { float4 positionOS : POSITION; };
            struct Varyings
            {
                float4 positionCS : SV_POSITION;
                float3 dir : TEXCOORD0;
            };

            float Hash(float2 p)
            {
                return frac(sin(dot(p, float2(127.1, 311.7))) * 43758.5453);
            }

            float Noise(float2 p)
            {
                float2 i = floor(p);
                float2 f = frac(p);
                f = f * f * (3.0 - 2.0 * f);
                float a = Hash(i);
                float b = Hash(i + float2(1, 0));
                float c = Hash(i + float2(0, 1));
                float d = Hash(i + float2(1, 1));
                return lerp(lerp(a, b, f.x), lerp(c, d, f.x), f.y);
            }

            Varyings vert(Attributes v)
            {
                Varyings o;
                o.positionCS = TransformObjectToHClip(v.positionOS.xyz);
                o.dir = v.positionOS.xyz;
                return o;
            }

            half4 frag(Varyings i) : SV_Target
            {
                float3 d = normalize(i.dir);
                float h = d.y;
                float3 col = lerp(_Bot.rgb, _Hor.rgb, saturate(h * 4.0 + 0.15));
                col = lerp(col, _Top.rgb, smoothstep(0.0, 0.65, h));
                float3 sunDir = normalize(_SunDir.xyz);
                float sunDot = saturate(dot(d, sunDir));
                col += _SunCol.rgb * pow(sunDot, 2200.0) * 0.55;
                col += _SunCol.rgb * pow(sunDot, 36.0) * 0.08;
                if (h > 0.05)
                {
                    float2 uv = d.xz / max(h, 0.2);
                    float n = Noise(uv * 1.6);
                    float n2 = Noise(uv * 3.1 + 8.2);
                    float cloud = saturate(n * 0.65 + n2 * 0.55 - 0.62);
                    col = lerp(col, float3(0.9, 0.92, 0.94), cloud * saturate(h * 2.0) * 0.28);
                }
                return half4(col, 1);
            }
            ENDHLSL
        }
    }
}
