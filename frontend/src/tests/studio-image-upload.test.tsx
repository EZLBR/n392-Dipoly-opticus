import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ImageAssetPicker from "../components/creator/ImageAssetPicker";
import { LanguageProvider } from "../contexts/LanguageContext";
import { listStudioImages, uploadStudioImage, type StudioImageAsset } from "../eyewear/private-images";

vi.mock("../eyewear/private-images", async importOriginal => ({
  ...await importOriginal<typeof import("../eyewear/private-images")>(),
  listStudioImages: vi.fn(async () => []),
  uploadStudioImage: vi.fn(),
}));

const asset: StudioImageAsset = {
  id: "421c683d-aada-4bc8-928d-5ff288460e0e", width: 8, height: 8, bytes: 100, mediaType: "image/webp",
};
const originalCreate = Object.getOwnPropertyDescriptor(URL, "createObjectURL");
const originalRevoke = Object.getOwnPropertyDescriptor(URL, "revokeObjectURL");
const revoke = vi.fn();

beforeEach(() => {
  localStorage.setItem("opticus_token", "session-a");
  localStorage.setItem("opticus_language", "pt");
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: () => "blob:sample" });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revoke });
});
afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.clearAllMocks();
  if (originalCreate) Object.defineProperty(URL, "createObjectURL", originalCreate);
  else Reflect.deleteProperty(URL, "createObjectURL");
  if (originalRevoke) Object.defineProperty(URL, "revokeObjectURL", originalRevoke);
  else Reflect.deleteProperty(URL, "revokeObjectURL");
});

async function selectImage() {
  const png = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const file = new File([png], "test.png", { type: "image/png" });
  vi.spyOn(file, "slice").mockReturnValue({ arrayBuffer: async () => png.buffer } as Blob);
  fireEvent.change(screen.getByLabelText("Arquivo de imagem"), { target: { files: [file] } });
  const preview = await screen.findByAltText("Prévia da imagem");
  Object.defineProperties(preview, { naturalWidth: { value: 8 }, naturalHeight: { value: 8 } });
  fireEvent.load(preview);
  return screen.getByRole("button", { name: "Enviar e aplicar" });
}

const mount = (onApply: (id: string) => void, onClose = vi.fn()) =>
  render(<LanguageProvider><ImageAssetPicker token="session-a" replacing={true} canUse={true}
    activeAssets={[]} onApply={onApply} onClose={onClose} /></LanguageProvider>);

describe("seleção de imagem no Studio", () => {
  it("aplica apenas após sucesso e permite tentar novamente após falha", async () => {
    vi.mocked(uploadStudioImage).mockRejectedValueOnce(new Error("disconnected")).mockResolvedValueOnce(asset);
    const apply = vi.fn();
    const view = mount(apply);
    const button = await selectImage();
    fireEvent.click(button);
    await screen.findByRole("alert");
    expect(apply).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Enviar e aplicar" }));
    await waitFor(() => expect(apply).toHaveBeenCalledExactlyOnceWith(asset.id));
    view.unmount();
    expect(revoke).toHaveBeenCalledWith("blob:sample");
  });

  it("ignora resposta de envio de uma conta que saiu antes da resposta", async () => {
    let complete!: (asset: StudioImageAsset) => void;
    vi.mocked(uploadStudioImage).mockImplementationOnce(() => new Promise(resolve => { complete = resolve; }));
    const apply = vi.fn();
    mount(apply);
    fireEvent.click(await selectImage());
    await waitFor(() => expect(uploadStudioImage).toHaveBeenCalled());
    localStorage.setItem("opticus_token", "session-b");
    await act(async () => { complete(asset); });
    expect(apply).not.toHaveBeenCalled();
    expect(listStudioImages).toHaveBeenCalledWith("session-a", expect.any(AbortSignal));
  });

  it("cancela a requisição antes de fechar a seleção", async () => {
    let complete!: (asset: StudioImageAsset) => void;
    let signal!: AbortSignal;
    vi.mocked(uploadStudioImage).mockImplementationOnce((_file, _token, activeSignal) => {
      signal = activeSignal;
      return new Promise(resolve => { complete = resolve; });
    });
    const apply = vi.fn();
    const close = vi.fn(() => expect(signal.aborted).toBe(true));
    mount(apply, close);
    fireEvent.click(await selectImage());
    await waitFor(() => expect(uploadStudioImage).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    await act(async () => { complete(asset); });
    expect(close).toHaveBeenCalledOnce();
    expect(apply).not.toHaveBeenCalled();
  });
});
