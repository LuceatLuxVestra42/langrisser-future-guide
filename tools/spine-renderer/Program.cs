using System;
using System.IO;
using Spine;

internal sealed class PathTextureLoader : TextureLoader {
    public void Load(AtlasPage page, string path) {
        if (!File.Exists(path)) throw new FileNotFoundException("Atlas texture not found.", path);
        page.rendererObject = Path.GetFullPath(path);
    }

    public void Unload(object texture) {
    }
}

internal static class Program {
    private static int Main(string[] args) {
        try {
        {
            string inputDir = args.Length > 0
                ? Path.GetFullPath(args[0])
                : Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "input"));

            string atlasPath = Path.Combine(inputDir, "Ymir_Skin01.atlas.asset");
            string skeletonPath = Path.Combine(inputDir, "Ymir_Skin01.skel.asset");
            string texturePath = Path.Combine(inputDir, "Ymir_Skin01.png");

            RequireFile(atlasPath);
            RequireFile(skeletonPath);
            RequireFile(texturePath);

            Console.WriteLine($"Input: {inputDir}");
            Console.WriteLine($"Texture: {new FileInfo(texturePath).Length:N0} bytes");

            using var atlasReader = new StreamReader(atlasPath);
            var atlas = new Atlas(atlasReader, inputDir, new PathTextureLoader());
            var binary = new SkeletonBinary(atlas);
            SkeletonData data;

            using (var stream = new BufferedStream(File.OpenRead(skeletonPath))) {
                data = binary.ReadSkeletonData(stream);
            }

            Console.WriteLine($"Spine version: {data.Version}");
            Console.WriteLine($"Skeleton size: {data.Width} x {data.Height}");
            Console.WriteLine($"Bones: {data.Bones.Count}");
            Console.WriteLine($"Slots: {data.Slots.Count}");
            Console.WriteLine($"Skins: {data.Skins.Count}");
            Console.WriteLine($"Animations: {data.Animations.Count}");
            Console.WriteLine();
            Console.WriteLine("Animation list:");

            for (int i = 0; i < data.Animations.Count; i++) {
                var animation = data.Animations.Items[i];
                Console.WriteLine($"- {animation.Name} ({animation.Duration:0.###}s)");
            }

            var preferred = data.FindAnimation("idle_Normal")
                ?? data.FindAnimation("idle_Dialog_Normal")
                ?? data.FindAnimation("idle_Battle_Normal");

            Console.WriteLine();
            Console.WriteLine(preferred == null
                ? "Representative animation: setup pose (no preferred idle animation found)"
                : $"Representative animation: {preferred.Name}");

            if (!string.Equals(data.Version, "3.3.05", StringComparison.Ordinal)) {
                Console.WriteLine($"WARNING: expected 3.3.05 but parsed {data.Version ?? "<null>"}.");
            }

            Console.WriteLine("Spine binary parse succeeded.");
            return 0;
        }
        catch (Exception ex) {
            Console.Error.WriteLine(ex);
            return 1;
        }
    }

    private static void RequireFile(string path) {
        if (!File.Exists(path)) throw new FileNotFoundException("Required input file not found.", path);
    }
}
